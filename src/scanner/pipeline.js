// Document-scanning image pipeline: corner detection, perspective correction
// and the page filters. Detection comes from the vendored jscanify; everything
// below it (validation, sizing, filters) is ours.
//
// OpenCV.js runs on a manually managed wasm heap: every Mat has to be deleted
// by hand or the tab dies a few pages in. Nothing in this file allocates a Mat
// outside a `scope()`, and every scope is released in a `finally`.

import jscanify from "./jscanify.js";
import { loadOpenCv } from "./opencvLoader.js";

export const FILTERS = {
  original: "Original",
  bright: "Bright",
  bw: "B&W",
};

// Long edge of a rendered page. Big enough to read small print, small enough to
// keep JPEG size and canvas memory sane on a phone.
const MAX_OUTPUT_EDGE = 2200;
// Phone cameras now shoot 48MP+. Decoding that into a canvas is wasteful and on
// iOS Safari canvases past ~16.7M pixels come back blank, so cap the source.
const MAX_SOURCE_PIXELS = 12_000_000;
// Detection runs on a small copy — contours do not get better with resolution,
// only slower, and this keeps the live camera overlay smooth.
const DETECT_EDGE = 480;
const CAPTURE_DETECT_EDGE = 1000;

let scanner = null;
const getScanner = () => {
  if (!scanner) scanner = new jscanify();
  return scanner;
};

export const ensureEngine = async () => {
  await loadOpenCv();
  getScanner();
};

// Tracks every wasm-heap object created inside one operation so a single
// `release()` in a finally block cleans up even when something throws.
const scope = () => {
  const owned = [];
  const track = (obj) => {
    owned.push(obj);
    return obj;
  };
  track.release = () => {
    for (let i = owned.length - 1; i >= 0; i--) {
      try {
        owned[i].delete();
      } catch {
        // already freed, or freed with its owning vector
      }
    }
    owned.length = 0;
  };
  return track;
};

const canvasPool = new Map();
// Reusing one canvas per purpose avoids allocating a fresh backing store on
// every animation frame during live detection.
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

const drawScaled = (canvas, source, sourceWidth, sourceHeight) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const fitScale = (width, height, maxEdge) =>
  Math.min(1, maxEdge / Math.max(width, height));

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const CORNER_KEYS = [
  "topLeftCorner",
  "topRightCorner",
  "bottomRightCorner",
  "bottomLeftCorner",
];

const asPolygon = (corners) => CORNER_KEYS.map((key) => corners[key]);

const polygonArea = (points) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
};

const isConvex = (points) => {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const c = points[(i + 2) % points.length];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) < 1e-6) continue;
    const current = Math.sign(cross);
    if (sign === 0) sign = current;
    else if (current !== sign) return false;
  }
  return true;
};

// jscanify picks the largest contour in the frame, which is happy to return the
// image border itself, a sliver, or a bowtie. Reject those rather than handing
// the user a broken crop.
const isPlausibleQuad = (corners, width, height) => {
  if (!corners) return false;
  const points = asPolygon(corners);
  if (points.some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return false;
  }

  const frameArea = width * height;
  const area = polygonArea(points);
  if (area < frameArea * 0.06 || area > frameArea * 0.99) return false;

  const minSide = Math.hypot(width, height) * 0.06;
  for (let i = 0; i < points.length; i++) {
    if (distance(points[i], points[(i + 1) % points.length]) < minSide) return false;
  }

  return isConvex(points);
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

// Detects the page in `source` (video frame, image or canvas) and returns the
// corners in *source* pixel coordinates, or null when nothing convincing is
// found. Detection itself happens on a downscaled copy.
export const detectCorners = (source, sourceWidth, sourceHeight, { fast = true } = {}) => {
  const cv = window.cv;
  if (!cv?.Mat || !sourceWidth || !sourceHeight) return null;

  const targetEdge = fast ? DETECT_EDGE : CAPTURE_DETECT_EDGE;
  const scale = fitScale(sourceWidth, sourceHeight, targetEdge);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = scratchCanvas(fast ? "detect-fast" : "detect-full", width, height);
  drawScaled(canvas, source, sourceWidth, sourceHeight);

  const track = scope();
  try {
    const mat = track(cv.imread(canvas));
    const contour = getScanner().findPaperContour(mat);
    if (!contour) return null;
    // findPaperContour frees its MatVector but the returned Mat shares the
    // refcounted buffer and is ours to release.
    track(contour);

    const corners = getScanner().getCornerPoints(contour);
    if (!isPlausibleQuad(corners, width, height)) return null;

    return clampCorners(scaleCorners(corners, 1 / scale), sourceWidth, sourceHeight);
  } catch (error) {
    // A bad frame must never break the live overlay, so failures fall back to
    // "no quad". Outside the camera loop that would hide real bugs, so say so.
    if (!fast) console.warn("Corner detection failed:", error);
    return null;
  } finally {
    track.release();
  }
};

// Estimates the illumination across the page: shrink hard, close over the text
// so glyphs do not drag the estimate down, blur, then scale back up. The result
// is a smooth "what colour would this pixel be if it were blank paper" map.
const estimateBackground = (cv, gray, track) => {
  const small = track(new cv.Mat());
  const smallScale = fitScale(gray.cols, gray.rows, 96);
  cv.resize(
    gray,
    small,
    new cv.Size(
      Math.max(8, Math.round(gray.cols * smallScale)),
      Math.max(8, Math.round(gray.rows * smallScale))
    ),
    0,
    0,
    cv.INTER_AREA
  );

  const kernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3)));
  cv.morphologyEx(small, small, cv.MORPH_CLOSE, kernel);
  cv.GaussianBlur(small, small, new cv.Size(9, 9), 0, 0, cv.BORDER_REPLICATE);

  const background = track(new cv.Mat());
  cv.resize(small, background, new cv.Size(gray.cols, gray.rows), 0, 0, cv.INTER_LINEAR);

  // Guard the divisor: a pixel estimated at 0 would blank out real content.
  const floor = track(new cv.Mat(background.rows, background.cols, background.type(), new cv.Scalar(8)));
  cv.max(background, floor, background);
  return background;
};

const applyBright = (cv, src, track) => {
  const rgb = track(new cv.Mat());
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

  const gray = track(new cv.Mat());
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const background = estimateBackground(cv, gray, track);
  const backgroundRgb = track(new cv.Mat());
  cv.cvtColor(background, backgroundRgb, cv.COLOR_GRAY2RGB);

  // Dividing by the illumination map flattens shadows and pushes paper to white
  // while leaving ink and colour stamps intact.
  const flattened = track(new cv.Mat());
  cv.divide(rgb, backgroundRgb, flattened, 255);
  flattened.convertTo(flattened, -1, 1.15, -12);

  const out = track(new cv.Mat());
  cv.cvtColor(flattened, out, cv.COLOR_RGB2RGBA);
  return out;
};

const applyBlackAndWhite = (cv, src, track) => {
  const gray = track(new cv.Mat());
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const background = estimateBackground(cv, gray, track);
  const flattened = track(new cv.Mat());
  cv.divide(gray, background, flattened, 255);

  // A fixed cut, not an adaptive one: dividing by the illumination map already
  // normalised blank paper to ~255, and an adaptive window narrower than a
  // stroke hollows out bold text and filled logos into outlines.
  const binary = track(new cv.Mat());
  cv.threshold(flattened, binary, 186, 255, cv.THRESH_BINARY);

  const out = track(new cv.Mat());
  cv.cvtColor(binary, out, cv.COLOR_GRAY2RGBA);
  return out;
};

// Output size from the corner geometry: average the opposing edges so a page
// photographed at an angle still comes out at roughly its true aspect.
const outputSize = (corners) => {
  const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = corners;
  const width = Math.max(distance(tl, tr), distance(bl, br));
  const height = Math.max(distance(tl, bl), distance(tr, br));
  const scale = fitScale(width, height, MAX_OUTPUT_EDGE);
  return {
    width: Math.max(16, Math.round(width * scale)),
    height: Math.max(16, Math.round(height * scale)),
  };
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

// Crops `source` to `corners`, flattens the perspective and applies the filter.
// Returns a fresh canvas holding the finished page.
export const renderPage = (source, sourceWidth, sourceHeight, { corners, filter = "original", rotation = 0 }) => {
  const cv = window.cv;
  if (!cv?.Mat) throw new Error("Scanner engine is not ready yet");

  const quad = corners || defaultCorners(sourceWidth, sourceHeight);
  const { width, height } = outputSize(quad);

  // cv.imread needs a canvas; going through one also caps absurd source sizes.
  const sourceScale = Math.min(
    1,
    Math.sqrt(MAX_SOURCE_PIXELS / (sourceWidth * sourceHeight))
  );
  const readCanvas = scratchCanvas(
    "read",
    Math.max(1, Math.round(sourceWidth * sourceScale)),
    Math.max(1, Math.round(sourceHeight * sourceScale))
  );
  drawScaled(readCanvas, source, sourceWidth, sourceHeight);

  const track = scope();
  try {
    const src = track(cv.imread(readCanvas));

    const from = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        quad.topLeftCorner.x * sourceScale, quad.topLeftCorner.y * sourceScale,
        quad.topRightCorner.x * sourceScale, quad.topRightCorner.y * sourceScale,
        quad.bottomLeftCorner.x * sourceScale, quad.bottomLeftCorner.y * sourceScale,
        quad.bottomRightCorner.x * sourceScale, quad.bottomRightCorner.y * sourceScale,
      ])
    );
    const to = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, 0, height, width, height])
    );

    const transform = track(cv.getPerspectiveTransform(from, to));
    const warped = track(new cv.Mat());
    cv.warpPerspective(
      src,
      warped,
      transform,
      new cv.Size(width, height),
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar()
    );

    let result = warped;
    if (filter === "bright") result = applyBright(cv, warped, track);
    else if (filter === "bw") result = applyBlackAndWhite(cv, warped, track);

    const out = document.createElement("canvas");
    cv.imshow(out, result);
    return rotateCanvas(out, rotation);
  } finally {
    track.release();
  }
};

export const canvasToBlob = (canvas, quality = 0.9) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the page"))),
      "image/jpeg",
      quality
    );
  });

// Frees the reusable detection/read canvases when the scanner unmounts. Mobile
// Safari is stingy with canvas memory and will not reclaim these on its own.
export const releaseScratch = () => {
  for (const canvas of canvasPool.values()) {
    canvas.width = 0;
    canvas.height = 0;
  }
  canvasPool.clear();
};
