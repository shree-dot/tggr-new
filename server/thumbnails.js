import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif", "tiff", "tif"]);
const VIDEO_EXTS = new Set(["mp4", "m4v", "mov", "webm", "mkv", "avi", "ogv"]);

const extOf = (name = "") => {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i + 1).toLowerCase();
};

export const isImageName = (name) => IMAGE_EXTS.has(extOf(name));
export const isVideoName = (name) => VIDEO_EXTS.has(extOf(name));
export const isThumbnailable = (name) => isImageName(name) || isVideoName(name);

const THUMB_SIZE = 320;
const THUMB_QUALITY = 72;

const grabVideoFrame = (srcPath, framePath, seekSeconds) =>
  execFileAsync(
    "ffmpeg",
    [
      "-y",
      "-ss", String(seekSeconds),
      "-i", srcPath,
      "-frames:v", "1",
      "-vf", `scale=${THUMB_SIZE}:-1:force_original_aspect_ratio=decrease`,
      framePath,
    ],
    { timeout: 20000 }
  );

// Generates a .webp thumbnail at destPath from an image or video source.
// Resolves false (never rejects) on anything that goes wrong — a missing
// thumbnail is not a fatal condition anywhere this is called from.
export const generateThumbnail = async (srcPath, destPath, filename) => {
  try {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    if (isImageName(filename)) {
      await sharp(srcPath, { failOn: "none" })
        .rotate() // respect EXIF orientation
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toFile(destPath);
      return true;
    }

    if (isVideoName(filename)) {
      const framePath = `${destPath}.frame.png`;
      try {
        try {
          await grabVideoFrame(srcPath, framePath, 1);
        } catch {
          // Video shorter than 1s (or seek failed) — fall back to the first frame.
          await grabVideoFrame(srcPath, framePath, 0);
        }
        await sharp(framePath).webp({ quality: THUMB_QUALITY }).toFile(destPath);
        return true;
      } finally {
        fs.rmSync(framePath, { force: true });
      }
    }
  } catch (err) {
    console.log(`Thumbnail generation skipped for ${filename}:`, err.message);
  }
  return false;
};
