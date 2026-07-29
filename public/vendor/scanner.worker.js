/* Document scanner engine — runs entirely off the main thread.
 *
 * OpenCV.js compiles a 6MB wasm module and reserves a 128MB heap. Doing that on
 * the UI thread freezes the page for as long as it takes and can take the whole
 * tab down with it; here the worst case is a dead worker and an error message.
 * Per-frame corner detection lives here too, so the camera preview never
 * competes with image processing for the main thread.
 *
 * Deliberately a plain classic script in public/ rather than a bundled module:
 * importScripts() is the one loader guaranteed to work for the vendored OpenCV
 * build, and it keeps this file runnable outside the app for testing.
 *
 * Protocol — every message carries an `id` that the reply echoes back:
 *   → { id, type: "init" }                        ← { id, ok }
 *   → { id, type: "detect", image, fast }         ← { id, corners | null }
 *   → { id, type: "render", image, corners, filter }
 *                                                 ← { id, image }
 * `image` is { buffer: ArrayBuffer (RGBA), width, height } and is transferred
 * in both directions, so no pixel data is ever copied between threads.
 */

/* global importScripts, jscanify, cv */

const MAX_OUTPUT_EDGE = 2200;
const CORNER_KEYS = ["topLeftCorner", "topRightCorner", "bottomRightCorner", "bottomLeftCorner"];

let scanner = null;
let ready = false;

const init = () =>
  new Promise((resolve, reject) => {
    if (ready) {
      resolve();
      return;
    }
    try {
      importScripts("/vendor/opencv.js", "/vendor/jscanify.js");
    } catch (error) {
      reject(new Error(`Could not load the scanner engine: ${error.message}`));
      return;
    }

    const settle = () => {
      scanner = new jscanify();
      ready = true;
      resolve();
    };

    // opencv.js hands back either a ready namespace, a Module still booting its
    // wasm runtime, or a promise for one, depending on how it was emitted.
    const candidate = self.cv;
    if (!candidate) {
      reject(new Error("opencv.js loaded but exposed no cv namespace"));
    } else if (typeof candidate.then === "function") {
      candidate.then((resolved) => {
        self.cv = resolved;
        settle();
      }, reject);
    } else if (candidate.Mat) {
      settle();
    } else {
      candidate.onRuntimeInitialized = settle;
    }
  });

// Tracks every wasm-heap object created in one operation so a single release()
// in a finally block cleans up even when something throws.
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
      } catch (error) {
        // already freed, or freed with its owning vector
      }
    }
    owned.length = 0;
  };
  return track;
};

const toMat = (image) => {
  const mat = new cv.Mat(image.height, image.width, cv.CV_8UC4);
  mat.data.set(new Uint8Array(image.buffer));
  return mat;
};

// Copies a Mat off the wasm heap into a transferable buffer.
const fromMat = (mat) => {
  const bytes = new Uint8ClampedArray(mat.data);
  return { buffer: bytes.buffer, width: mat.cols, height: mat.rows };
};

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
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

// jscanify returns the largest contour in the frame, which is happy to be the
// image border, a sliver, or a bowtie. Reject those instead of handing back a
// broken crop.
const isPlausibleQuad = (corners, width, height) => {
  if (!corners) return false;
  const points = asPolygon(corners);
  if (points.some((p) => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return false;

  const area = polygonArea(points);
  if (area < width * height * 0.06 || area > width * height * 0.99) return false;

  const minSide = Math.hypot(width, height) * 0.06;
  for (let i = 0; i < points.length; i++) {
    if (distance(points[i], points[(i + 1) % points.length]) < minSide) return false;
  }
  return isConvex(points);
};

const clampCorners = (corners, width, height) => {
  const clamped = {};
  for (const key of CORNER_KEYS) {
    clamped[key] = {
      x: Math.min(Math.max(corners[key].x, 0), width),
      y: Math.min(Math.max(corners[key].y, 0), height),
    };
  }
  return clamped;
};

const detect = (image) => {
  const track = scope();
  try {
    const mat = track(toMat(image));
    const contour = scanner.findPaperContour(mat);
    if (!contour) return null;
    // findPaperContour frees its MatVector, but the returned Mat shares the
    // refcounted buffer and is ours to release.
    track(contour);

    const corners = scanner.getCornerPoints(contour);
    if (!isPlausibleQuad(corners, image.width, image.height)) return null;
    return clampCorners(corners, image.width, image.height);
  } finally {
    track.release();
  }
};

// Estimates illumination across the page: shrink hard, close over the text so
// glyphs do not drag the estimate down, blur, scale back up. The result is a
// smooth "what colour would this pixel be if it were blank paper" map.
const estimateBackground = (gray, track) => {
  const small = track(new cv.Mat());
  const scale = Math.min(1, 96 / Math.max(gray.cols, gray.rows));
  cv.resize(
    gray,
    small,
    new cv.Size(Math.max(8, Math.round(gray.cols * scale)), Math.max(8, Math.round(gray.rows * scale))),
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

const applyBright = (src, track) => {
  const rgb = track(new cv.Mat());
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);

  const gray = track(new cv.Mat());
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const background = estimateBackground(gray, track);
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

const applyBlackAndWhite = (src, track) => {
  const gray = track(new cv.Mat());
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const background = estimateBackground(gray, track);
  const flattened = track(new cv.Mat());
  cv.divide(gray, background, flattened, 255);

  // A fixed cut, not an adaptive one: the division already normalised blank
  // paper to ~255, and an adaptive window narrower than a stroke hollows out
  // bold text and filled logos into outlines.
  const binary = track(new cv.Mat());
  cv.threshold(flattened, binary, 186, 255, cv.THRESH_BINARY);

  const out = track(new cv.Mat());
  cv.cvtColor(binary, out, cv.COLOR_GRAY2RGBA);
  return out;
};

// Output size from the corner geometry: take the longer of each opposing pair
// so a page photographed at an angle still comes out at roughly its true aspect.
const outputSize = (corners) => {
  const { topLeftCorner: tl, topRightCorner: tr, bottomRightCorner: br, bottomLeftCorner: bl } = corners;
  const width = Math.max(distance(tl, tr), distance(bl, br));
  const height = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, MAX_OUTPUT_EDGE / Math.max(width, height));
  return {
    width: Math.max(16, Math.round(width * scale)),
    height: Math.max(16, Math.round(height * scale)),
  };
};

const render = (image, corners, filter) => {
  const { width, height } = outputSize(corners);
  const track = scope();
  try {
    const src = track(toMat(image));

    const from = track(
      cv.matFromArray(4, 1, cv.CV_32FC2, [
        corners.topLeftCorner.x, corners.topLeftCorner.y,
        corners.topRightCorner.x, corners.topRightCorner.y,
        corners.bottomLeftCorner.x, corners.bottomLeftCorner.y,
        corners.bottomRightCorner.x, corners.bottomRightCorner.y,
      ])
    );
    const to = track(cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, 0, height, width, height]));

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
    if (filter === "bright") result = applyBright(warped, track);
    else if (filter === "bw") result = applyBlackAndWhite(warped, track);

    return fromMat(result);
  } finally {
    track.release();
  }
};

self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "init") {
      await init();
      self.postMessage({ id, ok: true });
      return;
    }

    if (!ready) await init();

    if (type === "detect") {
      self.postMessage({ id, corners: detect(event.data.image) });
      return;
    }

    if (type === "render") {
      const image = render(event.data.image, event.data.corners, event.data.filter);
      self.postMessage({ id, image }, [image.buffer]);
      return;
    }

    throw new Error(`Unknown scanner request: ${type}`);
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
