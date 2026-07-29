import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Camera,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Loader2,
  ScanLine,
  Upload as UploadIcon,
} from "lucide-react";
import api from "../api.js";
import TagPicker from "./TagPicker.jsx";
import ScanPageEditor from "./ScanPageEditor.jsx";
import {
  FILTERS,
  canvasToBlob,
  defaultCorners,
  detectCorners,
  ensureEngine,
  releaseScratch,
  renderPage,
} from "../scanner/pipeline.js";
import { buildImages, buildPdf, defaultScanName, sanitiseBaseName } from "../scanner/output.js";
import "../scanner.css";

// Camera frames are only re-analysed every ~90ms. Detection on a 480px copy
// costs a few milliseconds, but running it every frame competes with the video
// element for the main thread and makes the preview stutter on mid-range phones.
const DETECT_INTERVAL_MS = 90;
const MAX_SOURCE_PIXELS = 12_000_000;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the image"));
    image.src = url;
  });

const revokePage = (page) => {
  URL.revokeObjectURL(page.source.url);
  if (page.result) URL.revokeObjectURL(page.result.url);
};

const Scanner = () => {
  const navigate = useNavigate();

  const [engineState, setEngineState] = useState("loading"); // loading | ready | error
  const [engineError, setEngineError] = useState("");
  const [mode, setMode] = useState("camera"); // camera | files
  const [stage, setStage] = useState("capture"); // capture | save | done
  const [pages, setPages] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [filter, setFilter] = useState("bright");
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  const [fileName, setFileName] = useState(defaultScanName);
  const [format, setFormat] = useState("pdf");
  const [tag, setTag] = useState("");
  const [progress, setProgress] = useState(null);
  const [saveError, setSaveError] = useState("");
  const [savedTag, setSavedTag] = useState("");

  const videoRef = useRef(null);
  const overlayRef = useRef(null);
  const fileInputRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const pagesRef = useRef(pages);

  pagesRef.current = pages;

  useEffect(() => {
    let cancelled = false;
    ensureEngine().then(
      () => !cancelled && setEngineState("ready"),
      (error) => {
        if (cancelled) return;
        setEngineError(error.message);
        setEngineState("error");
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to the file picker on machines without a camera so desktop users
  // are not staring at a permission prompt they cannot satisfy.
  useEffect(() => {
    if (!navigator.mediaDevices?.getUserMedia) setMode("files");
  }, []);

  useEffect(
    () => () => {
      pagesRef.current.forEach(revokePage);
      releaseScratch();
    },
    []
  );

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const cameraActive = mode === "camera" && stage === "capture" && engineState === "ready";

  useEffect(() => {
    if (!cameraActive) return undefined;

    let stream = null;
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1440 },
        },
        audio: false,
      })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = mediaStream;
        setCameraError("");
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {
            // Autoplay can reject if the tab lost focus mid-start; the poster
            // state is harmless and the next tap resumes it.
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setCameraError(
          error?.name === "NotAllowedError"
            ? "Camera access was blocked. Allow it in your browser settings, or add photos from your device instead."
            : "No camera available. Add photos from your device instead."
        );
      });

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [cameraActive]);

  // Live corner overlay.
  useEffect(() => {
    if (!cameraActive || editingId) return undefined;

    let frame = 0;
    let lastRun = 0;

    const draw = (corners) => {
      const canvas = overlayRef.current;
      const video = videoRef.current;
      if (!canvas || !video) return;

      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!corners) return;

      // The video is letterboxed with object-fit: contain inside a box of the
      // same aspect ratio, so a single uniform scale maps frame to screen.
      const scale = canvas.width / video.videoWidth;
      ctx.beginPath();
      ["topLeftCorner", "topRightCorner", "bottomRightCorner", "bottomLeftCorner"].forEach(
        (key, index) => {
          const point = corners[key];
          const x = point.x * scale;
          const y = point.y * scale;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      );
      ctx.closePath();
      ctx.fillStyle = "rgba(200, 255, 114, 0.16)";
      ctx.fill();
      ctx.strokeStyle = "#c8ff72";
      ctx.lineWidth = 3 * ratio;
      ctx.stroke();
    };

    const tick = (timestamp) => {
      frame = requestAnimationFrame(tick);
      if (timestamp - lastRun < DETECT_INTERVAL_MS) return;
      lastRun = timestamp;

      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) return;
      draw(detectCorners(video, video.videoWidth, video.videoHeight));
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cameraActive, editingId]);

  const enqueue = useCallback((task) => {
    queueRef.current = queueRef.current.then(task, task);
    return queueRef.current;
  }, []);

  // Re-renders one page from its original photo and swaps in the new preview.
  const processPage = useCallback(async (page) => {
    try {
      const image = await loadImage(page.source.url);
      const canvas = renderPage(image, page.source.width, page.source.height, {
        corners: page.corners,
        filter: page.filter,
        rotation: page.rotation,
      });
      const blob = await canvasToBlob(canvas, 0.88);
      const result = { blob, url: URL.createObjectURL(blob) };
      canvas.width = 0;
      canvas.height = 0;

      setPages((current) =>
        current.map((item) => {
          if (item.id !== page.id) return item;
          if (item.result) URL.revokeObjectURL(item.result.url);
          return { ...item, result, processing: false };
        })
      );
    } catch (error) {
      setNotice(error.message || "Could not process that page");
      setPages((current) =>
        current.map((item) => (item.id === page.id ? { ...item, processing: false } : item))
      );
    }
  }, []);

  // Single entry point for both the camera and dropped files: normalise the
  // source, detect the page, then queue the render.
  const ingest = useCallback(
    async (source, sourceWidth, sourceHeight) => {
      const scale = Math.min(1, Math.sqrt(MAX_SOURCE_PIXELS / (sourceWidth * sourceHeight)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);

      const corners =
        detectCorners(canvas, canvas.width, canvas.height, { fast: false }) ||
        defaultCorners(canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, 0.92);
      canvas.width = 0;
      canvas.height = 0;

      const page = {
        id: newId(),
        source: {
          blob,
          url: URL.createObjectURL(blob),
          width: Math.max(1, Math.round(sourceWidth * scale)),
          height: Math.max(1, Math.round(sourceHeight * scale)),
        },
        corners,
        filter,
        rotation: 0,
        result: null,
        processing: true,
      };

      setPages((current) => [...current, page]);
      enqueue(() => processPage(page));
    },
    [enqueue, filter, processPage]
  );

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;

    setBusy(true);
    try {
      const frame = document.createElement("canvas");
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      frame.getContext("2d").drawImage(video, 0, 0);
      await ingest(frame, frame.width, frame.height);
      frame.width = 0;
      frame.height = 0;
    } catch (error) {
      setNotice(error.message || "Could not capture that frame");
    } finally {
      setBusy(false);
    }
  }, [ingest]);

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []).filter((file) => file.type.startsWith("image/"));
      const skipped = Array.from(fileList || []).length - files.length;
      if (skipped > 0) {
        setNotice(`${skipped} file${skipped === 1 ? "" : "s"} skipped — the scanner only accepts images.`);
      }
      if (!files.length) return;

      setBusy(true);
      try {
        // Sequential: two 48MP decodes at once is enough to get a mobile tab
        // killed, and the queue keeps page order predictable.
        for (const file of files) {
          const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
          try {
            await ingest(bitmap, bitmap.width, bitmap.height);
          } finally {
            bitmap.close?.();
          }
        }
      } catch (error) {
        setNotice(error.message || "Could not read those images");
      } finally {
        setBusy(false);
      }
    },
    [ingest]
  );

  // State updaters stay pure — queueing renders from inside one would fire
  // twice under StrictMode's double invocation.
  const updatePage = useCallback(
    (id, changes) => {
      const next = pagesRef.current.map((page) =>
        page.id === id ? { ...page, ...changes, processing: true } : page
      );
      setPages(next);
      const target = next.find((page) => page.id === id);
      if (target) enqueue(() => processPage(target));
    },
    [enqueue, processPage]
  );

  const deletePage = useCallback((id) => {
    const page = pagesRef.current.find((item) => item.id === id);
    if (page) revokePage(page);
    setPages(pagesRef.current.filter((item) => item.id !== id));
    setEditingId(null);
  }, []);

  const applyFilterToAll = useCallback(
    (draft) => {
      const next = pagesRef.current.map((page) =>
        page.id === editingId
          ? { ...page, ...draft, processing: true }
          : { ...page, filter: draft.filter, processing: true }
      );
      setPages(next);
      next.forEach((page) => enqueue(() => processPage(page)));
      setFilter(draft.filter);
      setEditingId(null);
    },
    [editingId, enqueue, processPage]
  );

  const editingPage = useMemo(
    () => pages.find((page) => page.id === editingId) || null,
    [pages, editingId]
  );
  const editingIndex = pages.findIndex((page) => page.id === editingId);
  const processing = pages.some((page) => page.processing);
  // A page whose render failed has no result and must not silently vanish from
  // the output, so block saving until every page has one.
  const rendered = pages.filter((page) => page.result);
  const canSave = pages.length > 0 && !processing && rendered.length === pages.length && Boolean(tag);

  const save = async () => {
    if (!canSave) return;
    setSaveError("");
    setBusy(true);

    try {
      const base = sanitiseBaseName(fileName);
      const parts = rendered.map((page) => ({ blob: page.result.blob }));
      const files = format === "pdf" ? [await buildPdf(parts, base)] : buildImages(parts, base);

      for (let index = 0; index < files.length; index++) {
        await api.uploadFile(tag, files[index], {
          onProgress: ({ bytesTransferred, totalBytes }) =>
            setProgress({
              index: index + 1,
              total: files.length,
              percent: totalBytes ? Math.round((bytesTransferred / totalBytes) * 100) : 0,
            }),
        });
      }

      pages.forEach(revokePage);
      setPages([]);
      setSavedTag(tag);
      setStage("done");
    } catch (error) {
      setSaveError(error.message || "Upload failed");
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  if (engineState === "loading") {
    return (
      <div className="scanner-shell scanner-centred">
        <Loader2 className="scanner-spin" size={28} aria-hidden="true" />
        <p className="scanner-hint">Loading the scanner engine…</p>
      </div>
    );
  }

  if (engineState === "error") {
    return (
      <div className="scanner-shell scanner-centred">
        <p className="scanner-error">{engineError}</p>
        <button type="button" className="scanner-btn" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="scanner-shell scanner-centred">
        <CheckCircle2 size={34} className="scanner-success-icon" aria-hidden="true" />
        <h2 className="scanner-title">Saved to {savedTag}</h2>
        <div className="scanner-done-actions">
          <Link className="scanner-btn is-primary" to={`/manage/${encodeURIComponent(savedTag)}`}>
            Open tag
          </Link>
          <button
            type="button"
            className="scanner-btn"
            onClick={() => {
              setStage("capture");
              setFileName(defaultScanName());
              setSavedTag("");
            }}
          >
            Scan another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scanner-shell">
      <header className="scanner-head">
        <h1 className="scanner-title">
          <ScanLine size={20} aria-hidden="true" /> Scan document
        </h1>
        {stage === "capture" ? (
          <div className="scanner-modes" role="group" aria-label="Capture mode">
            <button
              type="button"
              className={`scanner-chip${mode === "camera" ? " is-selected" : ""}`}
              onClick={() => setMode("camera")}
            >
              <Camera size={15} aria-hidden="true" /> Camera
            </button>
            <button
              type="button"
              className={`scanner-chip${mode === "files" ? " is-selected" : ""}`}
              onClick={() => setMode("files")}
            >
              <ImageIcon size={15} aria-hidden="true" /> Photos
            </button>
          </div>
        ) : null}
      </header>

      {notice ? (
        <p className="scanner-notice" role="status">
          {notice}
        </p>
      ) : null}

      {stage === "capture" ? (
        <>
          {mode === "camera" && !cameraError ? (
            <div className="scanner-viewport">
              <video ref={videoRef} className="scanner-video" playsInline muted autoPlay />
              <canvas ref={overlayRef} className="scanner-overlay" aria-hidden="true" />
            </div>
          ) : null}

          {mode === "camera" && cameraError ? <p className="scanner-error">{cameraError}</p> : null}

          {mode === "files" ? (
            <div
              className={`scanner-drop${isDragActive ? " is-active" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragActive(false);
                addFiles(event.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
              }}
            >
              <UploadIcon size={26} aria-hidden="true" />
              <p className="scanner-drop-title">Drop photos of your document</p>
              <p className="scanner-hint">or click to choose files — each one becomes a page</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(event) => {
                  addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </div>
          ) : null}

          <div className="scanner-capture-row">
            {mode === "camera" && !cameraError ? (
              <button
                type="button"
                className="scanner-shutter"
                onClick={capture}
                disabled={busy}
                aria-label="Capture page"
              >
                <span />
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {pages.length ? (
        <section className="scanner-strip" aria-label="Captured pages">
          {pages.map((page, index) => (
            <button
              key={page.id}
              type="button"
              className={`scanner-thumb${page.processing ? " is-processing" : ""}`}
              onClick={() => setEditingId(page.id)}
              disabled={page.processing}
            >
              {page.result ? (
                <img src={page.result.url} alt={`Page ${index + 1}`} />
              ) : (
                <Loader2 className="scanner-spin" size={18} aria-hidden="true" />
              )}
              <span className="scanner-thumb-index">{index + 1}</span>
            </button>
          ))}
        </section>
      ) : null}

      {pages.length ? (
        <div className="scanner-footer">
          {stage === "capture" ? (
            <button
              type="button"
              className="scanner-btn is-primary"
              onClick={() => setStage("save")}
              disabled={processing}
            >
              {processing ? "Processing…" : `Continue with ${pages.length} page${pages.length === 1 ? "" : "s"}`}
            </button>
          ) : (
            <button type="button" className="scanner-btn" onClick={() => setStage("capture")}>
              Add more pages
            </button>
          )}
        </div>
      ) : null}

      {stage === "save" ? (
        <section className="scanner-save panel-shell">
          <label className="scanner-field">
            <span>File name</span>
            <input
              type="text"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              disabled={busy}
            />
          </label>

          <div className="scanner-field" role="group" aria-label="Save as">
            <span>Save as</span>
            <div className="scanner-filter-row">
              <button
                type="button"
                className={`scanner-chip${format === "pdf" ? " is-selected" : ""}`}
                onClick={() => setFormat("pdf")}
              >
                <FileText size={15} aria-hidden="true" /> One PDF
              </button>
              <button
                type="button"
                className={`scanner-chip${format === "jpg" ? " is-selected" : ""}`}
                onClick={() => setFormat("jpg")}
              >
                <ImageIcon size={15} aria-hidden="true" /> Separate JPEGs
              </button>
            </div>
          </div>

          <div className="scanner-field">
            <span>Save to tag</span>
            <TagPicker value={tag} onChange={setTag} disabled={busy} />
          </div>

          {saveError ? <p className="scanner-error">{saveError}</p> : null}

          {progress ? (
            <div className="scanner-progress" role="status">
              <div className="scanner-progress-bar" style={{ width: `${progress.percent}%` }} />
              <span>
                Uploading {progress.index}/{progress.total} — {progress.percent}%
              </span>
            </div>
          ) : null}

          <div className="scanner-save-actions">
            <button type="button" className="scanner-btn" onClick={() => navigate("/")} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="scanner-btn is-primary" onClick={save} disabled={!canSave || busy}>
              {busy ? "Saving…" : "Save scan"}
            </button>
          </div>
        </section>
      ) : null}

      {editingPage ? (
        <ScanPageEditor
          page={editingPage}
          pageNumber={editingIndex + 1}
          pageCount={pages.length}
          onClose={() => setEditingId(null)}
          onDelete={() => deletePage(editingPage.id)}
          onApplyFilterToAll={applyFilterToAll}
          onCommit={(draft) => {
            setFilter(draft.filter);
            updatePage(editingPage.id, draft);
            setEditingId(null);
          }}
        />
      ) : null}

      {stage === "capture" && !pages.length ? (
        <p className="scanner-hint scanner-foot-hint">
          Frame the document until the outline snaps to its edges, then tap the shutter. Pages are
          brightened with the <strong>{FILTERS[filter]}</strong> filter — you can change that per page.
        </p>
      ) : null}
    </div>
  );
};

export default Scanner;
