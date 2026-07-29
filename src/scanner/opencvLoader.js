// Loads the vendored OpenCV build (public/vendor/opencv.js, ~8.6MB) on demand.
// Nothing here runs until the scanner route is opened, and the browser caches
// the file after the first scan, so the cost is paid once per device.

let loadPromise = null;

// The UMD build assigns window.cv, but what it assigns depends on how the wasm
// was emitted: an already-initialised namespace, a Module still booting its
// runtime, or a Promise resolving to the namespace. Handle all three.
const settle = (candidate) =>
  new Promise((resolve, reject) => {
    if (!candidate) {
      reject(new Error("opencv.js loaded but did not expose a cv namespace"));
      return;
    }
    if (typeof candidate.then === "function") {
      candidate.then(resolve, reject);
      return;
    }
    if (candidate.Mat) {
      resolve(candidate);
      return;
    }
    candidate.onRuntimeInitialized = () => resolve(window.cv);
  });

export const loadOpenCv = () => {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve(window.cv);
      return;
    }

    const script = document.createElement("script");
    script.src = "/vendor/opencv.js";
    script.async = true;
    script.onload = () => {
      settle(window.cv).then((cv) => {
        window.cv = cv; // normalise, so later callers hit the fast path above
        resolve(cv);
      }, reject);
    };
    script.onerror = () => {
      // Let a later attempt retry rather than caching the failure forever.
      loadPromise = null;
      script.remove();
      reject(new Error("Could not load the scanner engine. Check your connection and retry."));
    };

    document.head.appendChild(script);
  }).catch((error) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
};

export const isOpenCvReady = () => Boolean(window.cv?.Mat);
