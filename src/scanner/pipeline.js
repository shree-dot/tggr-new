// Main-thread half of the scanner. All OpenCV work happens in
// public/vendor/scanner.worker.js; this module owns the canvases, talks to the
// worker, and applies rotation (a cheap canvas op not worth a round trip).
//
// Everything that touches pixels is async now — the whole point is that the UI
// thread never waits on image processing.

export const FILTERS = {
  original: "Original",
  bright: "Bright",
  bw: "B&W",
};

export const CORNER_KEYS = [
  "topLeftCorner",
  "topRightCorner",
  "bottomRightCorner",
  "bottomLeftCorner",
];

// Phone cameras shoot 48MP+. Decoding that into a canvas is wasteful, and on
// iOS Safari canvases past ~16.7M pixels come back blank, so cap the source.
const MAX_SOURCE_PIXELS = 12_000_000;
// Contours do not get better with resolution, only slower.
const DETECT_EDGE = 1000;
// Compiling 6MB of wasm is slow on a cheap phone but not unbounded. If we are
// still waiting after this, something is wrong and the user deserves to know.
const ENGINE_TIMEOUT_MS = 60_000;

let worker = null;
let enginePromise = null;
let nextId = 1;
const pending = new Map();

const handleMessage = (event) => {
  const { id, error, ...payload } = event.data;
  const entry = pending.get(id);
  if (!entry) return;
  pending.delete(id);
  if (error) entry.reject(new Error(error));
  else entry.resolve(payload);
};

// A dead worker must never leave callers hanging on a promise that can no
// longer settle.
const handleFailure = (reason) => {
  const error = new Error(reason);
  for (const entry of pending.values()) entry.reject(error);
  pending.clear();
  worker = null;
  enginePromise = null;
};

const getWorker = () => {
  if (worker) return worker;
  // Classic worker served straight from public/ — no bundler in the path.
  worker = new Worker("/vendor/scanner.worker.js");
  worker.onmessage = handleMessage;
  worker.onerror = (event) =>
    handleFailure(event.message || "The scanner engine stopped unexpectedly");
  return worker;
};

const request = (type, payload = {}, transfer = []) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, type, ...payload }, transfer);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });

export const ensureEngine = () => {
  if (enginePromise) return enginePromise;

  enginePromise = Promise.race([
    request("init"),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("The scanner engine took too long to start.")),
        ENGINE_TIMEOUT_MS
      )
    ),
  ]).catch((error) => {
    enginePromise = null;
    throw error;
  });

  return enginePromise;
};

const canvasPool = new Map();
// Reusing one canvas per purpose avoids allocating a backing store per frame.
const scratchCanvas = (key, width, height) => {
  let canvas = canvasPool.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvasPool.set(key, canvas);
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas;
};

const fitScale = (width, height, maxEdge) => Math.min(1, maxEdge / Math.max(width, height));

// Draws a source (video frame, image, canvas) scaled into a canvas and hands
// back its pixels as something the worker can take ownership of.
const toTransferable = (key, source, sourceWidth, sourceHeight, scale) => {
  const canvas = scratchCanvas(
    key,
    Math.max(1, Math.round(sourceWidth * scale)),
    Math.max(1, Math.round(sourceHeight * scale))
  );
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { buffer: data.buffer, width, height };
};

const scaleCorners = (corners, factor) => {
  const scaled = {};
  for (const key of CORNER_KEYS) {
    scaled[key] = { x: corners[key].x * factor, y: corners[key].y * factor };
  }
  return scaled;
};

export const clampCorners = (corners, width, height) => {
  const clamped = {};
  for (const key of CORNER_KEYS) {
    clamped[key] = {
      x: Math.min(Math.max(corners[key].x, 0), width),
      y: Math.min(Math.max(corners[key].y, 0), height),
    };
  }
  return clamped;
};

// Sensible starting quad when detection finds nothing: a slight inset of the
// frame, which the user can drag into place.
export const defaultCorners = (width, height) => {
  const insetX = width * 0.06;
  const insetY = height * 0.06;
  return {
    topLeftCorner: { x: insetX, y: insetY },
    topRightCorner: { x: width - insetX, y: insetY },
    bottomRightCorner: { x: width - insetX, y: height - insetY },
    bottomLeftCorner: { x: insetX, y: height - insetY },
  };
};

// Detects the page in `source` and resolves with corners in *source* pixel
// coordinates, or null when nothing convincing is found. Runs once per captured
// page — the corners are then the user's to adjust.
export const detectCorners = async (source, sourceWidth, sourceHeight) => {
  if (!sourceWidth || !sourceHeight) return null;

  const scale = fitScale(sourceWidth, sourceHeight, DETECT_EDGE);
  const image = toTransferable("detect", source, sourceWidth, sourceHeight, scale);

  try {
    const { corners } = await request("detect", { image }, [image.buffer]);
    if (!corners) return null;
    return clampCorners(scaleCorners(corners, 1 / scale), sourceWidth, sourceHeight);
  } catch (error) {
    // Falling back to the default quad is recoverable; staying quiet about why
    // is not.
    console.warn("Corner detection failed:", error);
    return null;
  }
};

const rotateCanvas = (canvas, rotation) => {
  const turns = ((rotation % 360) + 360) % 360;
  if (turns === 0) return canvas;

  const swap = turns === 90 || turns === 270;
  const out = document.createElement("canvas");
  out.width = swap ? canvas.height : canvas.width;
  out.height = swap ? canvas.width : canvas.height;

  const ctx = out.getContext("2d");
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((turns * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
};

// Crops `source` to `corners`, flattens the perspective, applies the filter and
// resolves with a canvas holding the finished page.
export const renderPage = async (
  source,
  sourceWidth,
  sourceHeight,
  { corners, filter = "original", rotation = 0, maxEdge }
) => {
  const quad = corners || defaultCorners(sourceWidth, sourceHeight);
  const scale = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (sourceWidth * sourceHeight)));
  const image = toTransferable("read", source, sourceWidth, sourceHeight, scale);

  const { image: result } = await request(
    "render",
    { image, corners: scaleCorners(quad, scale), filter, maxEdge },
    [image.buffer]
  );

  const canvas = document.createElement("canvas");
  canvas.width = result.width;
  canvas.height = result.height;
  canvas
    .getContext("2d")
    .putImageData(new ImageData(new Uint8ClampedArray(result.buffer), result.width, result.height), 0, 0);

  return rotateCanvas(canvas, rotation);
};

export const canvasToBlob = (canvas, quality = 0.9) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the page"))),
      "image/jpeg",
      quality
    );
  });

// Tears the engine down when the scanner unmounts: the worker holds a 128MB
// wasm heap, and mobile Safari will not reclaim the scratch canvases on its own.
export const releaseEngine = () => {
  for (const canvas of canvasPool.values()) {
    canvas.width = 0;
    canvas.height = 0;
  }
  canvasPool.clear();

  if (worker) {
    worker.terminate();
    handleFailure("Scanner closed");
  }
};
