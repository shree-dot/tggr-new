/*
 * One-time migration: Firebase (Auth + Firestore + Storage) -> local SQLite + filesystem.
 *
 * Usage:
 *   1. Firebase console -> Project settings -> Service accounts -> Generate new private key
 *   2. cd server && npm install firebase-admin   (not a runtime dependency;
 *      installed only for this one-time migration to avoid shipping its
 *      transitive vulnerabilities in the running server)
 *   3. DATA_DIR=./data node migrate-from-firebase.js /path/to/serviceAccountKey.json
 *
 * Safe to re-run: rows are upserted and existing files are skipped.
 * Passwords cannot be migrated (Firebase uses its own scrypt variant) — imported
 * users sign up again with the same email to set a password; the server then
 * attaches the new password to the imported account, keeping uid/tags/files.
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import db, { FILES_DIR, parseJson } from "./db.js";

const require = createRequire(import.meta.url);

const keyPath = process.argv[2];
if (!keyPath || !fs.existsSync(keyPath)) {
  console.error("Usage: node migrate-from-firebase.js /path/to/serviceAccountKey.json");
  process.exit(1);
}

let initializeApp, cert, getAuth, getFirestore, getStorage;
try {
  ({ initializeApp, cert } = require("firebase-admin/app"));
  ({ getAuth } = require("firebase-admin/auth"));
  ({ getFirestore } = require("firebase-admin/firestore"));
  ({ getStorage } = require("firebase-admin/storage"));
} catch {
  console.error("firebase-admin is not installed. Run: npm install firebase-admin");
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
initializeApp({
  credential: cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
});

const auth = getAuth();
const firestore = getFirestore();
const bucket = getStorage().bucket();

const toIso = (value) => {
  if (!value) return new Date().toISOString();
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

const upsertUser = db.prepare(`
  INSERT INTO users (uid, name, email, password_hash, auth_provider, favorite_tags)
  VALUES (@uid, @name, @email, NULL, 'imported', @favorite_tags)
  ON CONFLICT(uid) DO UPDATE SET
    name = excluded.name,
    favorite_tags = excluded.favorite_tags
`);

// Rewrite every reference to a uid (used when merging a locally-created
// account with its imported Firebase counterpart).
const remapUid = (oldUid, newUid) => {
  db.prepare("UPDATE tags SET owner_uid = ? WHERE owner_uid = ?").run(newUid, oldUid);
  db.prepare("UPDATE files SET uploaded_by_uid = ? WHERE uploaded_by_uid = ?").run(newUid, oldUid);
  db.prepare("UPDATE access_requests SET requester_uid = ? WHERE requester_uid = ?").run(newUid, oldUid);
  for (const tag of db.prepare("SELECT id, allowed_uids FROM tags").all()) {
    const allowed = parseJson(tag.allowed_uids, []);
    if (allowed.includes(oldUid)) {
      const next = [...new Set(allowed.map((u) => (u === oldUid ? newUid : u)))];
      db.prepare("UPDATE tags SET allowed_uids = ? WHERE id = ?").run(JSON.stringify(next), tag.id);
    }
  }
};

const importUser = (user) => {
  const byEmail = db
    .prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE")
    .get(user.email);

  if (byEmail && byEmail.uid !== user.uid) {
    // Same email already signed up locally with a different uid. Merge: the
    // local account adopts the Firebase uid (so imported tags/files attach to
    // it) and keeps its local password. Anything the local uid already owned
    // is remapped as well.
    remapUid(byEmail.uid, user.uid);
    const favorites = new Set([
      ...parseJson(byEmail.favorite_tags, []),
      ...parseJson(user.favorite_tags, []),
    ]);
    db.prepare("UPDATE users SET uid = ?, favorite_tags = ? WHERE id = ?").run(
      user.uid,
      JSON.stringify([...favorites]),
      byEmail.id
    );
    console.log(`  merged existing local account ${user.email} into Firebase uid ${user.uid}`);
    return;
  }

  upsertUser.run(user);
};

const upsertTag = db.prepare(`
  INSERT INTO tags (name, owner_uid, access, desc, allowed_uids, created_at, last_activity_at)
  VALUES (@name, @owner_uid, @access, @desc, @allowed_uids, @created_at, @last_activity_at)
  ON CONFLICT(name) DO UPDATE SET
    owner_uid = excluded.owner_uid,
    access = excluded.access,
    desc = excluded.desc,
    allowed_uids = excluded.allowed_uids,
    last_activity_at = excluded.last_activity_at
`);

const upsertFile = db.prepare(`
  INSERT INTO files (tag_id, filename, size, uploaded_by, uploaded_by_uid, has_thumbnail, uploaded_at)
  VALUES (@tag_id, @filename, @size, @uploaded_by, @uploaded_by_uid, @has_thumbnail, @uploaded_at)
  ON CONFLICT(tag_id, filename) DO UPDATE SET
    size = excluded.size,
    uploaded_by = excluded.uploaded_by,
    uploaded_by_uid = excluded.uploaded_by_uid,
    has_thumbnail = excluded.has_thumbnail,
    uploaded_at = excluded.uploaded_at
`);

const migrateUsers = async () => {
  console.log("== Users ==");
  // Emails live in Firebase Auth; names/favorites live in the Firestore "users" collection.
  const authUsers = new Map();
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.forEach((u) => authUsers.set(u.uid, u));
    pageToken = page.pageToken;
  } while (pageToken);

  const snapshot = await firestore.collection("users").get();
  let count = 0;
  snapshot.forEach((doc) => {
    const data = doc.data();
    const uid = data.uid;
    if (!uid) return;
    const authUser = authUsers.get(uid);
    const email = authUser?.email || `${uid}@imported.local`;
    importUser({
      uid,
      name: data.name || authUser?.displayName || "User",
      email,
      favorite_tags: JSON.stringify(data.favoriteTags || []),
    });
    count += 1;
  });
  console.log(`Imported ${count} users (${authUsers.size} auth records matched by uid)`);
};

const migrateTags = async () => {
  console.log("== Tags ==");
  const snapshot = await firestore.collection("tags").get();
  let count = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.name || !data.owner) continue;

    upsertTag.run({
      name: data.name,
      owner_uid: data.owner,
      access: String(data.access) === "2" ? "2" : "1",
      desc: data.desc || "",
      allowed_uids: JSON.stringify(
        Array.isArray(data.users) ? data.users.filter(Boolean) : [data.owner]
      ),
      created_at: toIso(data.date || data.createdAt),
      last_activity_at: toIso(data.lastActivityAt || data.date),
    });

    const tagRow = db.prepare("SELECT id FROM tags WHERE name = ?").get(data.name);

    // Pending access requests
    const requests = Array.isArray(data.requests) ? data.requests : [];
    const reqNames = Array.isArray(data.reqNames) ? data.reqNames : [];
    requests.forEach((requesterUid, index) => {
      if (!requesterUid) return;
      db.prepare(
        `INSERT OR IGNORE INTO access_requests (tag_id, requester_uid, message)
         VALUES (?, ?, ?)`
      ).run(
        tagRow.id,
        requesterUid,
        reqNames[index] || `Access request for ${data.name}`
      );
    });

    // Per-file metadata from the "files" subcollection
    const filesSnapshot = await doc.ref.collection("files").get();
    filesSnapshot.forEach((fileDoc) => {
      const meta = fileDoc.data();
      upsertFile.run({
        tag_id: tagRow.id,
        filename: fileDoc.id,
        size: 0, // fixed up after storage download
        uploaded_by: meta.uploadedBy || "Unknown",
        uploaded_by_uid: meta.uploadedByUid || "",
        has_thumbnail: meta.thumbnailPath ? 1 : 0,
        uploaded_at: toIso(meta.uploadedAt),
      });
    });

    count += 1;
  }
  console.log(`Imported ${count} tags`);
};

const migrateStorage = async () => {
  console.log("== Storage files ==");
  const [objects] = await bucket.getFiles();
  let downloaded = 0;
  let skipped = 0;

  for (const object of objects) {
    // Storage layout is <tag>/<filename> and <tag>/.thumbs/<filename>.webp
    const parts = object.name.split("/");
    if (parts.length < 2 || parts.some((p) => p === "..")) {
      console.warn(`Skipping unexpected object path: ${object.name}`);
      continue;
    }

    const localPath = path.join(FILES_DIR, ...parts);
    if (fs.existsSync(localPath)) {
      skipped += 1;
      continue;
    }

    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    await object.download({ destination: localPath });
    downloaded += 1;
    if (downloaded % 25 === 0) {
      console.log(`  downloaded ${downloaded} files...`);
    }
  }
  console.log(`Downloaded ${downloaded} objects, skipped ${skipped} already present`);
};

const reconcileFiles = () => {
  console.log("== Reconcile file metadata with downloaded data ==");
  const tags = db.prepare("SELECT * FROM tags").all();
  let added = 0;

  for (const tag of tags) {
    const dir = path.join(FILES_DIR, tag.name);
    if (!fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      const stat = fs.statSync(path.join(dir, entry.name));
      const hasThumb = fs.existsSync(path.join(dir, ".thumbs", `${entry.name}.webp`));
      const existing = db
        .prepare("SELECT * FROM files WHERE tag_id = ? AND filename = ?")
        .get(tag.id, entry.name);

      upsertFile.run({
        tag_id: tag.id,
        filename: entry.name,
        size: stat.size,
        uploaded_by: existing?.uploaded_by || "Unknown",
        uploaded_by_uid: existing?.uploaded_by_uid || "",
        has_thumbnail: hasThumb ? 1 : 0,
        uploaded_at: existing?.uploaded_at || stat.mtime.toISOString(),
      });
      if (!existing) added += 1;
    }
  }
  console.log(`Reconciled file rows (${added} discovered from storage only)`);
};

const run = async () => {
  await migrateUsers();
  await migrateTags();
  await migrateStorage();
  reconcileFiles();
  console.log("\nMigration complete.");
  console.log(
    "Note: passwords are not migrated. Each user signs up again with the SAME email to set a new password — their uid, tags, files and favorites are preserved."
  );
  process.exit(0);
};

run().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
