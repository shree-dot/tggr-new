# Vendored scanner engine

`opencv.js` + `opencv.wasm` back the document scanner (`src/scanner/`). Both are
taken from the [jscanify](https://github.com/puffinsoft/jscanify) npm package
(`src/opencv.js`), which ships an OpenCV 4.x emscripten build. MIT / Apache-2.0.

## The wasm is deliberately a separate file — do not re-copy opencv.js as-is

The upstream build is a **single file**: the 7MB wasm module is embedded inside
the JavaScript as a `data:application/octet-stream;base64,` URI, making it
8.56MB of JS. That build hangs and then crashes the tab, because emscripten's
loader explicitly refuses to stream a data URI:

```js
if (!wasmBinary && typeof WebAssembly.instantiateStreaming === "function"
    && !isDataURI(wasmBinaryFile) && typeof fetch === "function") { ...stream... }
```

With a data URI it takes the fallback path, which base64-decodes ~9.5MB into
7MB of bytes **synchronously on the main thread** before compiling anything.

So the vendored copy is patched: the wasm is extracted to `opencv.wasm` and the
loader points at it by bare filename, which emscripten resolves through
`locateFile()` relative to the script's own directory (so it works under any
base path). `WebAssembly.instantiateStreaming` then compiles it off-thread while
it downloads, and the browser caches the two files independently.

To re-vendor after an upstream update, re-run the extraction rather than copying
the package file directly:

```bash
node scripts/extract-opencv-wasm.mjs <path-to-upstream-opencv.js>
```

`opencv.wasm` must be served as `application/wasm`. Vite, Netlify and the
Express `static` handler all do this by default; if streaming ever fails the
loader falls back to a plain fetch + compile, which still works but is slower.
