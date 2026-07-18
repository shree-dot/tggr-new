import express from "express";
import cookieParser from "cookie-parser";
import multer from "multer";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";
import db, { DATA_DIR, FILES_DIR, parseJson } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const DIST_DIR = path.resolve(process.env.DIST_DIR || path.join(__dirname, "..", "dist"));
const COOKIE_NAME = "tggr_token";
const TOKEN_TTL = "30d";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const ALLOW_SIGNUP = (process.env.ALLOW_SIGNUP || "true").toLowerCase() !== "false";
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Comma-separated list of admin emails; these accounts see the admin
// dashboard and can manage users, quotas, and access.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "sagarshreesha1999@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const isAdminUser = (user) => ADMIN_EMAILS.includes((user?.email || "").toLowerCase());

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
// Behind cloudflared/reverse proxies req.secure reflects X-Forwarded-Proto.
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});

// Simple in-memory rate limiter for the auth endpoints (brute-force guard).
const authAttempts = new Map();
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const AUTH_MAX_ATTEMPTS = 20;
const authRateLimit = (req, res, next) => {
  const now = Date.now();
  const key = req.ip;
  const entry = authAttempts.get(key) || { count: 0, windowStart: now };
  if (now - entry.windowStart > AUTH_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count += 1;
  authAttempts.set(key, entry);
  if (authAttempts.size > 10000) {
    authAttempts.clear();
  }
  if (entry.count > AUTH_MAX_ATTEMPTS) {
    return res.status(429).json({ error: "Too many attempts. Try again later." });
  }
  next();
};

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
  isAdmin: isAdminUser(row),
});

const getUserByUid = db.prepare("SELECT * FROM users WHERE uid = ?");
const getUserByEmail = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE");
const getTagByName = db.prepare("SELECT * FROM tags WHERE name = ?");

const issueToken = (req, res, uid) => {
  const token = jwt.sign({ uid }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure, // Secure over the Cloudflare tunnel, plain http on LAN
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
    if (user.disabled) {
      res.clearCookie(COOKIE_NAME, { path: "/" });
      return res.status(403).json({ error: "Your access has been revoked by the administrator" });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Not authenticated" });
  }
};

const requireAdmin = (req, res, next) => {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// Bytes attributed to a user across all tags (their uploads, wherever they live).
const getUserUsage = db.prepare(
  "SELECT COALESCE(SUM(size), 0) AS bytes FROM files WHERE uploaded_by_uid = ?"
);

// Returns an error string if adding `incomingBytes` would push the user over
// their storage limit; null when allowed (no limit, or within it).
const quotaViolation = (user, incomingBytes) => {
  if (!user.storage_limit_bytes) return null;
  const used = getUserUsage.get(user.uid).bytes;
  if (used + incomingBytes <= user.storage_limit_bytes) return null;
  const gb = (n) => (n / (1024 * 1024 * 1024)).toFixed(2);
  return `Storage limit reached: ${gb(used)} GB used of your ${gb(user.storage_limit_bytes)} GB limit`;
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

app.get("/api/config", (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, allowSignup: ALLOW_SIGNUP });
});

// Google Sign-In: the browser gets an ID token from Google Identity Services
// and posts it here; we verify it against our client id and issue our own
// session cookie. Accounts are matched (or created) by verified email.
app.post("/api/auth/google", authRateLimit, async (req, res) => {
  if (!googleClient) {
    return res.status(501).json({ error: "Google Sign-In is not configured on this server" });
  }
  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: "Missing Google credential" });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: "Google sign-in could not be verified" });
  }

  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: "Google account has no verified email" });
  }

  const existing = getUserByEmail.get(payload.email);
  if (existing) {
    if (existing.disabled) {
      return res.status(403).json({ error: "Your access has been revoked by the administrator" });
    }
    issueToken(req, res, existing.uid);
    return res.json({ user: publicUser(existing) });
  }

  if (!ALLOW_SIGNUP) {
    return res.status(403).json({ error: "Sign-ups are disabled on this server" });
  }

  const uid = crypto.randomUUID().replace(/-/g, "");
  db.prepare(
    "INSERT INTO users (uid, name, email, password_hash, auth_provider) VALUES (?, ?, ?, NULL, 'google')"
  ).run(uid, payload.name || payload.email.split("@")[0], payload.email);
  issueToken(req, res, uid);
  res.json({ user: publicUser(getUserByUid.get(uid)) });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: "/" });
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// Long-lived bearer token for iOS Shortcuts / scripted uploads, where the
// Google Sign-In browser flow isn't possible. Same JWT the cookie uses,
// just with a 1-year expiry; revocation = user gets disabled or the
// JWT secret rotates.
app.post("/api/auth/device-token", requireAuth, (req, res) => {
  const token = jwt.sign({ uid: req.user.uid }, JWT_SECRET, { expiresIn: "365d" });
  res.json({ token, expiresInDays: 365 });
});

// Tag names the user can upload to, shaped for the Shortcuts "Choose from
// List" action: owned tags plus tags they've been granted access to.
app.get("/api/shortcut/tags", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT name, allowed_uids, owner_uid FROM tags ORDER BY last_activity_at DESC`
    )
    .all();
  const names = rows
    .filter(
      (row) =>
        row.owner_uid === req.user.uid ||
        parseJson(row.allowed_uids, []).includes(req.user.uid)
    )
    .map((row) => row.name);
  res.json({ tags: names });
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

// Keep the DB in sync with the tag's directory so files copied onto the NAS
// manually (e.g. dropped in over SMB or restored from a Firebase download)
// show up without any import step.
const syncTagDirWithDb = (tag) => {
  const dir = tagDir(tag.name);
  if (!fs.existsSync(dir)) return;

  const onDisk = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue;
    onDisk.add(entry.name);

    const existing = db
      .prepare("SELECT id, size FROM files WHERE tag_id = ? AND filename = ?")
      .get(tag.id, entry.name);
    if (existing) continue;

    const stat = fs.statSync(path.join(dir, entry.name));
    const hasThumb = fs.existsSync(path.join(thumbsDir(tag.name), `${entry.name}.webp`));
    db.prepare(
      `INSERT INTO files (tag_id, filename, size, uploaded_by, uploaded_by_uid, has_thumbnail, uploaded_at)
       VALUES (?, ?, ?, 'Unknown', '', ?, ?)`
    ).run(tag.id, entry.name, stat.size, hasThumb ? 1 : 0, stat.mtime.toISOString());
  }

  // Drop rows for files that no longer exist on disk.
  const rows = db.prepare("SELECT id, filename FROM files WHERE tag_id = ?").all(tag.id);
  for (const row of rows) {
    if (!onDisk.has(row.filename)) {
      db.prepare("DELETE FROM files WHERE id = ?").run(row.id);
    }
  }
};

app.get("/api/tags/:name/files", requireAuth, (req, res) => {
  const tag = loadTagWithAccess(req, res);
  if (!tag) return;
  syncTagDirWithDb(tag);
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

  const quotaError = quotaViolation(req.user, req.file.size);
  if (quotaError) {
    cleanup();
    return res.status(413).json({ error: quotaError });
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

/* ---------- chunked uploads (files larger than the tunnel's 100MB cap) ---------- */

const UPLOADS_TMP = path.join(DATA_DIR, ".uploads");
const isValidUploadId = (id) => /^[a-f0-9]{16,64}$/i.test(id);

// Receive one chunk, streamed straight to a temp file (no full-body buffering).
// :index is constrained to digits so it never captures the "complete" route.
app.post("/api/tags/:name/uploads/:uploadId/:index(\\d+)", requireAuth, (req, res) => {
  const tag = loadTagWithAccess(req, res);
  if (!tag) return;

  const { uploadId, index } = req.params;
  const idx = Number(index);
  if (!isValidUploadId(uploadId) || !Number.isInteger(idx) || idx < 0 || idx > 200000) {
    return res.status(400).json({ error: "Invalid chunk request" });
  }

  const dir = path.join(UPLOADS_TMP, uploadId);
  fs.mkdirSync(dir, { recursive: true });
  const out = fs.createWriteStream(path.join(dir, String(idx)));

  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    out.destroy();
    res.status(500).json({ error: "Chunk write failed" });
  };

  req.on("error", fail);
  out.on("error", fail);
  out.on("finish", () => {
    if (!failed) res.json({ ok: true });
  });
  req.pipe(out);
});

// Assemble the received chunks into the final file, in order.
app.post("/api/tags/:name/uploads/:uploadId/complete", requireAuth, (req, res) => {
  const tag = loadTagWithAccess(req, res);
  if (!tag) return;

  const { uploadId } = req.params;
  const { filename, totalChunks } = req.body || {};
  const total = Number(totalChunks);

  if (!isValidUploadId(uploadId)) {
    return res.status(400).json({ error: "Invalid upload id" });
  }
  if (!isSafeFilename(filename)) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  if (!Number.isInteger(total) || total < 1 || total > 200000) {
    return res.status(400).json({ error: "Invalid chunk count" });
  }

  const dir = path.join(UPLOADS_TMP, uploadId);
  let incomingBytes = 0;
  for (let i = 0; i < total; i++) {
    const chunkPath = path.join(dir, String(i));
    if (!fs.existsSync(chunkPath)) {
      return res.status(400).json({ error: `Missing chunk ${i}, please retry the upload` });
    }
    incomingBytes += fs.statSync(chunkPath).size;
  }

  const quotaError = quotaViolation(req.user, incomingBytes);
  if (quotaError) {
    fs.rmSync(dir, { recursive: true, force: true });
    return res.status(413).json({ error: quotaError });
  }

  fs.mkdirSync(tagDir(tag.name), { recursive: true });
  const finalPath = path.join(tagDir(tag.name), filename);
  const out = fs.createWriteStream(finalPath);

  let failed = false;
  const fail = (err) => {
    if (failed) return;
    failed = true;
    console.log("Assemble error:", err);
    out.destroy();
    fs.rmSync(finalPath, { force: true });
    res.status(500).json({ error: "Failed to assemble file" });
  };

  out.on("error", fail);
  out.on("finish", () => {
    if (failed) return;
    const size = fs.statSync(finalPath).size;
    db.prepare(
      `INSERT INTO files (tag_id, filename, size, uploaded_by, uploaded_by_uid, has_thumbnail)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(tag_id, filename) DO UPDATE SET
         size = excluded.size,
         uploaded_by = excluded.uploaded_by,
         uploaded_by_uid = excluded.uploaded_by_uid,
         has_thumbnail = 0,
         uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    ).run(tag.id, filename, size, req.user.name, req.user.uid);
    touchActivity.run(tag.id);
    fs.rmSync(dir, { recursive: true, force: true });

    const row = db
      .prepare("SELECT * FROM files WHERE tag_id = ? AND filename = ?")
      .get(tag.id, filename);
    res.json({ file: fileRowToJson(tag, row) });
  });

  const appendChunk = (i) => {
    if (failed) return;
    if (i >= total) {
      out.end();
      return;
    }
    const inp = fs.createReadStream(path.join(dir, String(i)));
    inp.on("error", fail);
    inp.on("end", () => appendChunk(i + 1));
    inp.pipe(out, { end: false });
  };
  appendChunk(0);
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

app.patch("/api/tags/:name/files/:filename", requireAuth, (req, res) => {
  const tag = getTagByName.get(req.params.name);
  if (!tag) {
    return res.status(404).json({ error: "Tag not found" });
  }
  if (tag.owner_uid !== req.user.uid) {
    return res.status(403).json({ error: "Only the owner can rename files" });
  }

  const oldName = req.params.filename;
  const newName = (req.body?.newName || "").trim();
  if (!isSafeFilename(oldName) || !isSafeFilename(newName)) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  const fromPath = path.join(tagDir(tag.name), oldName);
  if (!fs.existsSync(fromPath)) {
    return res.status(404).json({ error: "File not found" });
  }
  if (newName === oldName) {
    const row = db
      .prepare("SELECT * FROM files WHERE tag_id = ? AND filename = ?")
      .get(tag.id, oldName);
    return res.json({ file: fileRowToJson(tag, row) });
  }

  const toPath = path.join(tagDir(tag.name), newName);
  if (fs.existsSync(toPath)) {
    return res.status(409).json({ error: "A file with that name already exists" });
  }

  fs.renameSync(fromPath, toPath);

  // Carry the thumbnail across too, if one exists.
  const oldThumb = path.join(thumbsDir(tag.name), `${oldName}.webp`);
  if (fs.existsSync(oldThumb)) {
    fs.renameSync(oldThumb, path.join(thumbsDir(tag.name), `${newName}.webp`));
  }

  const updated = db
    .prepare("UPDATE files SET filename = ? WHERE tag_id = ? AND filename = ?")
    .run(newName, tag.id, oldName);
  if (updated.changes === 0) {
    // No DB row yet (e.g. a file copied in manually) — create one from disk.
    const stat = fs.statSync(toPath);
    const hasThumb = fs.existsSync(path.join(thumbsDir(tag.name), `${newName}.webp`));
    db.prepare(
      `INSERT INTO files (tag_id, filename, size, uploaded_by, uploaded_by_uid, has_thumbnail, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(tag.id, newName, stat.size, req.user.name, req.user.uid, hasThumb ? 1 : 0, stat.mtime.toISOString());
  }
  touchActivity.run(tag.id);

  const row = db
    .prepare("SELECT * FROM files WHERE tag_id = ? AND filename = ?")
    .get(tag.id, newName);
  res.json({ file: fileRowToJson(tag, row) });
});

/* ---------- admin ---------- */

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
  const totals = {
    users: db.prepare("SELECT COUNT(*) AS n FROM users").get().n,
    activeUsers: db.prepare("SELECT COUNT(*) AS n FROM users WHERE disabled = 0").get().n,
    tags: db.prepare("SELECT COUNT(*) AS n FROM tags").get().n,
    files: db.prepare("SELECT COUNT(*) AS n FROM files").get().n,
    bytes: db.prepare("SELECT COALESCE(SUM(size), 0) AS n FROM files").get().n,
  };

  // Physical disk footprint of the data volume, when the platform exposes it.
  let disk = null;
  try {
    const stat = fs.statfsSync(DATA_DIR);
    disk = {
      total: stat.blocks * stat.bsize,
      free: stat.bavail * stat.bsize,
    };
  } catch {
    // statfs unavailable on this platform — the UI hides the disk tile.
  }

  const recentFiles = db
    .prepare(
      `SELECT f.filename, f.size, f.uploaded_by, f.uploaded_at, t.name AS tag
       FROM files f JOIN tags t ON t.id = f.tag_id
       ORDER BY f.uploaded_at DESC LIMIT 8`
    )
    .all();

  res.json({ totals, disk, recentFiles });
});

app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.uid, u.name, u.email, u.auth_provider, u.created_at, u.disabled,
              u.storage_limit_bytes,
              COALESCE(f.bytes, 0) AS bytes_used,
              COALESCE(f.file_count, 0) AS file_count,
              f.last_upload_at,
              COALESCE(t.tag_count, 0) AS tag_count
       FROM users u
       LEFT JOIN (
         SELECT uploaded_by_uid,
                SUM(size) AS bytes,
                COUNT(*) AS file_count,
                MAX(uploaded_at) AS last_upload_at
         FROM files GROUP BY uploaded_by_uid
       ) f ON f.uploaded_by_uid = u.uid
       LEFT JOIN (
         SELECT owner_uid, COUNT(*) AS tag_count FROM tags GROUP BY owner_uid
       ) t ON t.owner_uid = u.uid
       ORDER BY bytes_used DESC, u.created_at ASC`
    )
    .all();

  res.json({
    users: rows.map((row) => ({
      uid: row.uid,
      name: row.name,
      email: row.email,
      provider: row.auth_provider,
      createdAt: row.created_at,
      disabled: !!row.disabled,
      isAdmin: isAdminUser(row),
      storageLimitBytes: row.storage_limit_bytes,
      bytesUsed: row.bytes_used,
      fileCount: row.file_count,
      tagCount: row.tag_count,
      lastUploadAt: row.last_upload_at,
    })),
  });
});

app.patch("/api/admin/users/:uid", requireAuth, requireAdmin, (req, res) => {
  const target = getUserByUid.get(req.params.uid);
  if (!target) {
    return res.status(404).json({ error: "User not found" });
  }

  const { disabled, storageLimitGb } = req.body || {};

  if (disabled !== undefined) {
    if (target.uid === req.user.uid) {
      return res.status(400).json({ error: "You cannot revoke your own access" });
    }
    if (isAdminUser(target) && disabled) {
      return res.status(400).json({ error: "Admin accounts cannot be revoked" });
    }
    db.prepare("UPDATE users SET disabled = ? WHERE uid = ?").run(disabled ? 1 : 0, target.uid);
  }

  if (storageLimitGb !== undefined) {
    const gb = Number(storageLimitGb);
    if (!Number.isFinite(gb) || gb < 0 || gb > 100000) {
      return res.status(400).json({ error: "Invalid storage limit" });
    }
    const bytes = Math.round(gb * 1024 * 1024 * 1024);
    db.prepare("UPDATE users SET storage_limit_bytes = ? WHERE uid = ?").run(bytes, target.uid);
  }

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
  // HTML-ish uploads must not render on this origin (stored XSS); force download.
  const ext = path.extname(filename).toLowerCase();
  if ([".html", ".htm", ".xhtml", ".shtml", ".svg", ".xml"].includes(ext)) {
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
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

// Sweep abandoned chunk-upload temp dirs (older than 24h) on startup.
try {
  if (fs.existsSync(UPLOADS_TMP)) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const entry of fs.readdirSync(UPLOADS_TMP, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = path.join(UPLOADS_TMP, entry.name);
      if (fs.statSync(p).mtimeMs < cutoff) {
        fs.rmSync(p, { recursive: true, force: true });
      }
    }
  }
} catch (err) {
  console.log("Upload temp cleanup skipped:", err);
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`tggr server listening on http://0.0.0.0:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
  if (!GOOGLE_CLIENT_ID) {
    console.warn(
      "WARNING: GOOGLE_CLIENT_ID is not set — Google Sign-In is the only auth method, so nobody will be able to log in."
    );
  }
});
