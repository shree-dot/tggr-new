import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, Crop, Eye, Loader2, Maximize2, RotateCw, Trash2, X } from "lucide-react";
import {
  CORNER_KEYS,
  FILTERS,
  canvasToBlob,
  clampCorners,
  defaultCorners,
  renderPage,
} from "../scanner/pipeline.js";

// Previews render small: they only have to show what the filter and rotation do,
// and a full 2200px render per keystroke would make the controls feel sluggish.
const PREVIEW_EDGE = 900;

// Handle and stroke sizes are expressed in source-image units so they stay a
// constant on-screen size regardless of how large the photo is.
const handleRadius = (width, height) => Math.max(width, height) * 0.022;

const toSvgPoint = (svg, event) => {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const ctm = svg.getScreenCTM();
  return ctm ? point.matrixTransform(ctm.inverse()) : { x: 0, y: 0 };
};

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read the page"));
    image.src = url;
  });

// Full-screen editor for a single captured page: drag the four corners in Crop,
// then flip to Preview to see the filter and orientation actually applied.
const ScanPageEditor = ({
  page,
  pageNumber,
  pageCount,
  onCommit,
  onDelete,
  onClose,
  onApplyFilterToAll,
}) => {
  const [corners, setCorners] = useState(page.corners);
  const [filter, setFilter] = useState(page.filter);
  const [rotation, setRotation] = useState(page.rotation);
  const [dragKey, setDragKey] = useState(null);
  const [view, setView] = useState("crop");
  const [preview, setPreview] = useState({ url: "", loading: false, error: "" });
  const svgRef = useRef(null);
  const sourceRef = useRef(null);

  const { width, height } = page.source;

  useEffect(() => {
    setCorners(page.corners);
    setFilter(page.filter);
    setRotation(page.rotation);
  }, [page.id, page.corners, page.filter, page.rotation]);

  // Decode the original once and keep it — the preview re-renders from it on
  // every filter, rotation or corner change.
  useEffect(() => {
    sourceRef.current = null;
    return () => {
      sourceRef.current = null;
    };
  }, [page.source.url]);

  useEffect(() => {
    if (view !== "preview") return undefined;

    let cancelled = false;
    let objectUrl = "";
    setPreview((current) => ({ ...current, loading: true, error: "" }));

    (async () => {
      try {
        if (!sourceRef.current) sourceRef.current = await loadImage(page.source.url);
        const canvas = await renderPage(sourceRef.current, width, height, {
          corners,
          filter,
          rotation,
          maxEdge: PREVIEW_EDGE,
        });
        const blob = await canvasToBlob(canvas, 0.85);
        canvas.width = 0;
        canvas.height = 0;
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview({ url: objectUrl, loading: false, error: "" });
      } catch (error) {
        if (!cancelled) {
          setPreview({ url: "", loading: false, error: error.message || "Preview failed" });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [view, corners, filter, rotation, page.source.url, width, height]);

  const moveCorner = useCallback(
    (key, event) => {
      const svg = svgRef.current;
      if (!svg) return;
      const point = toSvgPoint(svg, event);
      setCorners((current) =>
        clampCorners({ ...current, [key]: { x: point.x, y: point.y } }, width, height)
      );
    },
    [width, height]
  );

  const handlePointerDown = (key) => (event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragKey(key);
    moveCorner(key, event);
  };

  const handlePointerMove = (event) => {
    if (!dragKey) return;
    event.preventDefault();
    moveCorner(dragKey, event);
  };

  const endDrag = () => setDragKey(null);

  // Changing a filter or rotating is pointless if you cannot see the result, so
  // these switch to the preview themselves.
  const chooseFilter = (key) => {
    setFilter(key);
    setView("preview");
  };

  const rotate = () => {
    setRotation((current) => (current + 90) % 360);
    setView("preview");
  };

  const radius = handleRadius(width, height);
  const polygon = CORNER_KEYS.map((key) => `${corners[key].x},${corners[key].y}`).join(" ");

  return (
    <div className="scanner-editor" role="dialog" aria-modal="true" aria-label={`Edit page ${pageNumber}`}>
      <header className="scanner-editor-bar">
        <button type="button" className="scanner-icon-btn" onClick={onClose} aria-label="Discard changes">
          <X size={18} />
        </button>
        <span className="scanner-editor-title">
          Page {pageNumber} of {pageCount}
        </span>
        <button
          type="button"
          className="scanner-icon-btn is-primary"
          onClick={() => onCommit({ corners, filter, rotation })}
          aria-label="Apply changes"
        >
          <Check size={18} />
        </button>
      </header>

      <div className="scanner-viewtabs" role="group" aria-label="View">
        <button
          type="button"
          className={`scanner-chip${view === "crop" ? " is-selected" : ""}`}
          onClick={() => setView("crop")}
          aria-pressed={view === "crop"}
        >
          <Crop size={15} aria-hidden="true" /> Crop
        </button>
        <button
          type="button"
          className={`scanner-chip${view === "preview" ? " is-selected" : ""}`}
          onClick={() => setView("preview")}
          aria-pressed={view === "preview"}
        >
          <Eye size={15} aria-hidden="true" /> Preview
        </button>
      </div>

      <div className="scanner-editor-stage">
        {view === "crop" ? (
          <div className="scanner-editor-frame">
            {/* The frame fills the stage rather than matching the photo's aspect:
                the image (object-fit: contain) and the SVG (viewBox + xMidYMid
                meet) letterbox inside it identically, so the handles stay on the
                image regardless of the frame's shape. */}
            <img src={page.source.url} alt="" className="scanner-editor-image" draggable="false" />
            <svg
              ref={svgRef}
              className="scanner-editor-overlay"
              viewBox={`0 0 ${width} ${height}`}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <polygon points={polygon} className="scanner-quad" strokeWidth={radius * 0.34} />
              {CORNER_KEYS.map((key) => (
                <g key={key}>
                  <circle
                    cx={corners[key].x}
                    cy={corners[key].y}
                    r={radius}
                    className={`scanner-handle${dragKey === key ? " is-active" : ""}`}
                    strokeWidth={radius * 0.28}
                  />
                  {/* Invisible, larger hit area — fingers are wider than the dot. */}
                  <circle
                    cx={corners[key].x}
                    cy={corners[key].y}
                    r={radius * 2.4}
                    className="scanner-handle-hit"
                    onPointerDown={handlePointerDown(key)}
                  />
                </g>
              ))}
            </svg>
          </div>
        ) : (
          <div className="scanner-preview">
            {preview.url ? (
              <img src={preview.url} alt={`Page ${pageNumber} preview`} className="scanner-preview-image" />
            ) : null}
            {preview.loading ? (
              <div className="scanner-preview-veil">
                <Loader2 className="scanner-spin" size={22} aria-hidden="true" />
              </div>
            ) : null}
            {preview.error ? <p className="scanner-error">{preview.error}</p> : null}
          </div>
        )}
      </div>

      <div className="scanner-editor-tools">
        <div className="scanner-filter-row" role="group" aria-label="Filter">
          {Object.entries(FILTERS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`scanner-chip${filter === key ? " is-selected" : ""}`}
              onClick={() => chooseFilter(key)}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="scanner-editor-actions">
          <button type="button" className="scanner-chip" onClick={rotate}>
            <RotateCw size={15} aria-hidden="true" /> Rotate
          </button>
          <button
            type="button"
            className="scanner-chip"
            onClick={() => {
              setCorners(defaultCorners(width, height));
              setView("crop");
            }}
          >
            <Maximize2 size={15} aria-hidden="true" /> Reset crop
          </button>
          {pageCount > 1 ? (
            <button
              type="button"
              className="scanner-chip"
              onClick={() => onApplyFilterToAll({ corners, filter, rotation })}
            >
              Apply {FILTERS[filter]} to all
            </button>
          ) : null}
          <button type="button" className="scanner-chip is-danger" onClick={onDelete}>
            <Trash2 size={15} aria-hidden="true" /> Delete page
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScanPageEditor;
