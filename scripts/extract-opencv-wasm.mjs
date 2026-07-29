// Splits the single-file emscripten OpenCV build into opencv.js + opencv.wasm.
//
// The upstream bundle inlines the wasm as a base64 data URI, which forces the
// loader off its streaming path and onto a synchronous main-thread decode of
// ~9.5MB — long enough to hang and then crash the tab. See public/vendor/README.md.
//
// Usage: node scripts/extract-opencv-wasm.mjs [source-opencv.js]
//        defaults to node_modules/jscanify/src/opencv.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = process.argv[2] || path.join(root, "node_modules/jscanify/src/opencv.js");
const outDir = path.join(root, "public/vendor");

const js = fs.readFileSync(source, "utf8");

const marker = 'var wasmBinaryFile="data:application/octet-stream;base64,';
const start = js.indexOf(marker);
if (start === -1) {
  console.error(
    `No inlined wasm found in ${source}.\n` +
      "Upstream may already ship a separate .wasm — in that case copy both files across instead."
  );
  process.exit(1);
}

const base64Start = start + marker.length;
const base64End = js.indexOf('"', base64Start);
const base64 = js.slice(base64Start, base64End);
const wasm = Buffer.from(base64, "base64");

// Sanity check: every wasm module starts with \0asm and version 1.
if (wasm.readUInt32BE(0) !== 0x0061736d || wasm.readUInt32LE(4) !== 1) {
  console.error("Decoded payload is not a wasm module — aborting.");
  process.exit(1);
}

// Bare filename: emscripten runs it through locateFile(), which resolves it
// against the directory the script itself was loaded from.
const patched =
  js.slice(0, start) + 'var wasmBinaryFile="opencv.wasm";' + js.slice(base64End + 2);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "opencv.wasm"), wasm);
fs.writeFileSync(path.join(outDir, "opencv.js"), patched);

const mb = (bytes) => (bytes / 1048576).toFixed(2);
console.log(`source     ${mb(js.length)} MB`);
console.log(`opencv.js  ${mb(patched.length)} MB`);
console.log(`opencv.wasm ${mb(wasm.length)} MB`);
