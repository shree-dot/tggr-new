import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db, { DATA_DIR, FILES_DIR, parseJson } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, "..", "dist"));
const COOKIE_NAME = "tggr_token";
const TOKEN_TTL = "30d";

const secretFile = path.join(DATA_DIR, ".jwt-secret");
const JWT_SECRET =
  process.env.JWT_SECRET ||
  (fs.existsSync(secretFile)
    ? fs.readFileSync(secretFile, "utf8").trim()
    : (() => {
        const secret = crypto.randomBytes(48).toString("hex");
        fs.writeFileSync(secretFile, secret, { mode: 0o600 });
        return secret;
      })());

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

/* ---------- helpers ---------- */

const TAG_NAME_RE = /^(?!\.)[\w.-]{1,20}$/;

const isSafeFilename = (name) =>
  typeof name === "string" &&
  name.length > 0 &&
  name.length <= 255 &&
  !name.startsWith(".") &&
  path.basename(name) === name &&
  !name.includes("/") &&
  !name.includes("\\");

const tagDir = (tagName) => path.join(FILES_DIR, tagName);
const thumbsDir = (tagName) => path.join(tagDir(tagName), ".thumbs");

const publicUser = (row) => ({
  uid: row.uid,
  name: row.name,
  email: row.email,
  favoriteTags: parseJson(row.favorite_tags, []),
});

const getUserByUid = db.prepare("SELECT * FROM users WHERE uid = ?");
const getUserByEmail = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE");
const getTagByName = db.prepare("SELECT * FROM tags WHERE name = ?");

const issueToken = (res, uid) => {
  const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
  return token;
};

const requireAuth = (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = req.cookies[COOKIE_NAME] || (header.startsWith("Bearer ") ? header.slice(7) : "");
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getUserByUid.get(payload.uid);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
};

const canViewTag = (tag, uid) => {
  if (tag.owner_uid === uid) return true;
  if (tag.access !== "2") return true;
  return parseJson(tag.allowed_uids, []).includes(uid);
};

const touchActivity = db.prepare(
  "UPDATE tags SET last_activity_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
);

const fileRowToJson = (tag, row) => ({
  name: row.filename,
  fullPath: `${tag.name}/${row.filename}`,
  url: `/files/${encodeURIComponent(tag.name)}/${encodeURIComponent(row.filename)}`,
  thumbnailURL: row.has_thumbnail
    ? `/files/${encodeURIComponent(tag.name)}/thumbs/${encodeURIComponent(row.filename)}`
    : "",
  timeCreated: row.uploaded_at,
  size: row.size,
  uploadedBy: row.uploaded_by,
});

/* ---------- auth ---------- */

app.post("/api/auth/signup", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || password.length < 6) {
    return res
      .status(400)
      .json({ error: "Name, email and a password of at least 6 characters are required" });
  }

  const existing = getUserByEmail.get(email.trim());
  const hash = await bcrypt.hash(password, 10);

  if (existing) {
    if (existing.password_hash) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }
    // Account imported from Firebase without a usable password — claim it.
    db.prepare("UPDATE users SET password_hash = ?, name = ? WHERE id = ?").run(
      hash,
      name.trim(),
      existing.id
    );
    issueToken(res, existing.uid);
    return res.json({ user: publicUser(getUserByUid.get(existing.uid)) });
  }

  const uid = crypto.randomUUID().replace(/-/g, "");
  db.prepare(
    "INSERT INTO users (uid, name, email, password_hash) VALUES (?, ?, ?, ?)"
  ).run(uid, name.trim(), email.trim(), hash);
  issueToken(res, uid);
  res.json({ user: publicUser(getUserByUid.get(uid)) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const user = email ? getUserByEmail.get(email.trim()) : null;
  if (!user) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  if (!user.password_hash) {
    return res.status(409).json({
      error:
        "This account was imported from Firebase. Please sign up again with the same email to set a new password — your tags and files are preserved.",
    });
  }
  const ok = await bcrypt.compare(password || "", user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  issueToken(res, user.uid);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/* ---------- favorites ---------- */

app.put("/api/me/favorites", requireAuth, (req, res) => {
  const { tag, favorite } = req.body || {};
  if (typeof tag !== "string" || !tag) {
    return res.status(400).json({ error: "Tag is required" });
  }
  const favs = new Set(parseJson(req.user.favorite_tags, []));
  if (favorite) {
    favs.add(tag);
  } else {
    favs.delete(tag);
  }
  db.prepare("UPDATE users SET favorite_tags = ? WHERE id = ?").run(
    JSON.stringify([...favs]),
    req.user.id
  );
  res.json({ favoriteTags: [...favs] });
});

/* ---------- tags ---------- */

app.get("/api/tags/mine", requireAuth, (req, res) => {
  const rows = db
    .prepare("SELECT * FROM tags WHERE owner_uid = ? ORDER BY last_activity_at DESC")
    .all(req.user.uid);
  res.json({
    tags: rows.map((row) => ({
      id: row.id,
      name: row.name,
      date: row.created_at,
      lastActivityAt: row.last_activity_at,
    })),
  });
});

app.post("/api/tags", requireAuth, (req, res) => {
  const { name, access, desc } = req.body || {};
  const clean = (name || "").trim();
  if (!TAG_NAME_RE.test(clean)) {
    return res.status(400).json({
      error: "Tag name must be 1-20 characters (letters, numbers, _ - .) with no spaces",
    });
  }
  if (getTagByName.get(clean)) {
    return res.status(409).json({ error: "Tag already exists" });
  }
  db.prepare(
    "INSERT INTO tags (name, owner_uid, access, desc, allowed_uids) VALUES (?, ?, ?, ?, ?)"
  ).run(clean, req.user.uid, String(access) === "2" ? "2" : "1", desc || "", JSON.stringify([req.user.uid]));
  fs.mkdirSync(tagDir(clean), { recursive: true });
  res.json({ ok: true, name: clean });
});

app.get("/api/tags/:name", requireAuth, (req, res) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    return res.json({ exists: false });
  }
  const ownerRow = getUserByUid.get(tag.owner_uid);
  const allowed = canViewTag(tag, req.user.uid);
  const requested = !!db
    .prepare("SELECT 1 FROM access_requests WHERE tag_id = ? AND requester_uid = ?")
    .get(tag.id, req.user.uid);
  res.json({
    exists: true,
    allowed,
    requested,
    name: tag.name,
    desc: tag.desc,
    access: tag.access,
    owner: { uid: tag.owner_uid, name: ownerRow ? ownerRow.name : "Unknown" },
    isOwner: tag.owner_uid === req.user.uid,
  });
});

app.delete("/api/tags/:name", requireAuth, (req, res) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    return res.status(404).json({ error: "Tag not found" });
  }
  if (tag.owner_uid !== req.user.uid) {
    return res.status(403).json({ error: "Only the owner can delete a tag" });
  }
  fs.rmSync(tagDir(tag.name), { recursive: true, force: true });
  db.prepare("DELETE FROM tags WHERE id = ?").run(tag.id);
  // Remove the tag from every user's favorites.
  const users = db.prepare("SELECT id, favorite_tags FROM users").all();
  const updateFavs = db.prepare("UPDATE users SET favorite_tags = ? WHERE id = ?");
  for (const u of users) {
    const favs = parseJson(u.favorite_tags, []);
    if (favs.includes(tag.name)) {
      updateFavs.run(JSON.stringify(favs.filter((f) => f !== tag.name)), u.id);
    }
  }
  res.json({ ok: true });
});

/* ---------- access requests ---------- */

app.post("/api/tags/:name/request", requireAuth, (req, res) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    return res.status(404).json({ error: "Tag not found" });
  }
  if (canViewTag(tag, req.user.uid)) {
    return res.json({ ok: true, alreadyAllowed: true });
  }
  const existing = db
    .prepare("SELECT 1 FROM access_requests WHERE tag_id = ? AND requester_uid = ?")
    .get(tag.id, req.user.uid);
  if (existing) {
    return res.status(409).json({ error: "Request already sent" });
  }
  db.prepare(
    "INSERT INTO access_requests (tag_id, requester_uid, message) VALUES (?, ?, ?)"
  ).run(tag.id, req.user.uid, `${req.user.name} is requesting access for ${tag.name}`);
  res.json({ ok: true });
});

app.get("/api/requests", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.requester_uid, r.message, t.name AS tag
       FROM access_requests r JOIN tags t ON t.id = r.tag_id
       WHERE t.owner_uid = ? ORDER BY r.created_at DESC`
    )
    .all(req.user.uid);
  res.json({
    requests: rows.map((row) => ({
      id: row.id,
      tag: row.tag,
      requesterUid: row.requester_uid,
      message: row.message,
    })),
  });
});

app.post("/api/requests/:id/resolve", requireAuth, (req, res) => {
  const { action } = req.body || {};
  const row = db
    .prepare(
      `SELECT r.*, t.owner_uid, t.allowed_uids, t.id AS tag_id
       FROM access_requests r JOIN tags t ON t.id = r.tag_id WHERE r.id = ?`
    )
    .get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: "Request not found" });
  }
  if (row.owner_uid !== req.user.uid) {
    return res.status(403).json({ error: "Not your tag" });
  }
  if (action === "accept") {
    const allowed = new Set(parseJson(row.allowed_uids, []));
    allowed.add(row.requester_uid);
    db.prepare("UPDATE tags SET allowed_uids = ? WHERE id = ?").run(
      JSON.stringify([...allowed]),
      row.tag_id
    );
  }
  db.prepare("DELETE FROM access_requests WHERE id = ?").run(row.id);
  res.json({ ok: true });
});

/* ---------- files ---------- */

const loadTagWithAccess = (req, res) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    res.status(404).json({ error: "Tag not found" });
    return null;
  }
  if (!canViewTag(tag, req.user.uid)) {
    res.status(403).json({ error: "You don't have permission" });
    return null;
  }
  return tag;
};

app.get("/api/tags/:name/files", requireAuth, (req, res) => {
  const tag = loadTagWithAccess(req, res);
  if (!tag) return;
  const rows = db
    .prepare("SELECT * FROM files WHERE tag_id = ? ORDER BY uploaded_at DESC")
    .all(tag.id);
  res.json({ files: rows.map((row) => fileRowToJson(tag, row)) });
});

const upload = multer({
  dest: path.join(DATA_DIR, ".uploads"),
  limits: { fileSize: 20 * 1024 * 1024 * 1024 },
});

app.post("/api/tags/:name/files", requireAuth, upload.single("file"), (req, res) => {
  const cleanup = () => {
    if (req.file) fs.rmSync(req.file.path, { force: true });
  };
  const tag = loadTagWithAccess(req, res);
  if (!tag) return cleanup();
  if (!req.file) {
    return res.status(400).json({ error: "No file provided" });
  }
  const filename = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  if (!isSafeFilename(filename)) {
    cleanup();
    return res.status(400).json({ error: "Invalid filename" });
  }

  fs.mkdirSync(tagDir(tag.name), { recursive: true });
  fs.renameSync(req.file.path, path.join(tagDir(tag.name), filename));

  db.prepare(
    `INSERT INTO files (tag_id, filename, size, uploaded_by, uploaded_by_uid, has_thumbnail)
     VALUES (?, ?, ?, ?, ?, 0)
     ON CONFLICT(tag_id, filename) DO UPDATE SET
       size = excluded.size,
       uploaded_by = excluded.uploaded_by,
       uploaded_by_uid = excluded.uploaded_by_uid,
       has_thumbnail = 0,
       uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  ).run(tag.id, filename, req.file.size, req.user.name, req.user.uid);
  touchActivity.run(tag.id);

  const row = db
    .prepare("SELECT * FROM files WHERE tag_id = ? AND filename = ?")
    .get(tag.id, filename);
  res.json({ file: fileRowToJson(tag, row) });
});

app.post(
  "/api/tags/:name/files/:filename/thumbnail",
  requireAuth,
  express.raw({ type: ["image/webp", "image/*"], limit: "10mb" }),
  (req, res) => {
    const tag = loadTagWithAccess(req, res);
    if (!tag) return;
    const filename = req.params.filename;
    if (!isSafeFilename(filename) || !Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({ error: "Invalid thumbnail upload" });
    }
    const fileRow = db
      .prepare("SELECT * FROM files WHERE tag_id = ? AND filename = ?")
      .get(tag.id, filename);
    if (!fileRow) {
      return res.status(404).json({ error: "File not found" });
    }
    fs.mkdirSync(thumbsDir(tag.name), { recursive: true });
    fs.writeFileSync(path.join(thumbsDir(tag.name), `${filename}.webp`), req.body);
    db.prepare("UPDATE files SET has_thumbnail = 1 WHERE id = ?").run(fileRow.id);
    res.json({
      thumbnailURL: `/files/${encodeURIComponent(tag.name)}/thumbs/${encodeURIComponent(filename)}`,
    });
  }
);

app.delete("/api/tags/:name/files/:filename", requireAuth, (req, res) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    return res.status(404).json({ error: "Tag not found" });
  }
  if (tag.owner_uid !== req.user.uid) {
    return res.status(403).json({ error: "Only the owner can delete files" });
  }
  const filename = req.params.filename;
  if (!isSafeFilename(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  fs.rmSync(path.join(tagDir(tag.name), filename), { force: true });
  fs.rmSync(path.join(thumbsDir(tag.name), `${filename}.webp`), { force: true });
  db.prepare("DELETE FROM files WHERE tag_id = ? AND filename = ?").run(tag.id, filename);
  res.json({ ok: true });
});

/* ---------- file downloads ---------- */

const serveTagFile = (req, res, isThumb) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    return res.status(404).send("Not found");
  }
  if (!canViewTag(tag, req.user.uid)) {
    return res.status(403).send("Forbidden");
  }
  const filename = req.params.filename;
  if (!isSafeFilename(filename)) {
    return res.status(400).send("Bad filename");
  }
  const filePath = isThumb
    ? path.join(thumbsDir(tag.name), `${filename}.webp`)
    : path.join(tagDir(tag.name), filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Not found");
  }
  res.sendFile(filePath);
};

app.get("/files/:name/thumbs/:filename", requireAuth, (req, res) =>
  serveTagFile(req, res, true)
);
app.get("/files/:name/:filename", requireAuth, (req, res) => serveTagFile(req, res, false));

/* ---------- static frontend ---------- */

if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/files/")) {
      return next();
    }
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`tggr server listening on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});
