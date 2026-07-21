// One-off / re-runnable: generates thumbnails for every existing image and
// video across every tag — including hidden (vaulted) tags — for files that
// don't already have one. Safe to re-run; skips anything already thumbnailed
// unless --force is passed.
//
// Usage:
//   cd server
//   DATA_DIR=/path/to/data node generate-thumbnails.js [--force]

import fs from "fs";
import path from "path";
import db, { DATA_DIR, FILES_DIR } from "./db.js";
import { isThumbnailable, generateThumbnail } from "./thumbnails.js";

const FORCE = process.argv.includes("--force");
const VAULT_DIR = path.join(DATA_DIR, ".vault");

const tagDir = (tag) =>
  tag.hidden && tag.store_dir ? path.join(VAULT_DIR, tag.store_dir) : path.join(FILES_DIR, tag.name);
const thumbsDir = (tag) => path.join(tagDir(tag), ".thumbs");

const run = async () => {
  const tags = db.prepare("SELECT * FROM tags").all();
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const tag of tags) {
    const dir = tagDir(tag);
    if (!fs.existsSync(dir)) continue;

    const entries = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && !e.name.startsWith("."));

    for (const entry of entries) {
      const filename = entry.name;
      if (!isThumbnailable(filename)) continue;

      const srcPath = path.join(dir, filename);
      const destPath = path.join(thumbsDir(tag), `${filename}.webp`);

      if (!FORCE && fs.existsSync(destPath)) {
        skipped++;
        continue;
      }

      process.stdout.write(`  ${tag.name}/${filename} ... `);
      const ok = await generateThumbnail(srcPath, destPath, filename);
      if (ok) {
        db.prepare(
          "UPDATE files SET has_thumbnail = 1 WHERE tag_id = ? AND filename = ?"
        ).run(tag.id, filename);
        done++;
        console.log("ok");
      } else {
        failed++;
        console.log("failed (unsupported or corrupt file?)");
      }
    }
  }

  console.log(`\nDone. Generated ${done}, skipped ${skipped} (already had one), failed ${failed}.`);
  process.exit(0);
};

run().catch((err) => {
  console.error("Thumbnail backfill failed:", err);
  process.exit(1);
});
