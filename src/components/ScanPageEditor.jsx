import React, { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCw, Trash2, X, Maximize2 } from "lucide-react";
import { CORNER_KEYS, FILTERS, clampCorners, defaultCorners } from "../scanner/pipeline.js";

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

// Full-screen editor for a single captured page: drag the four corners, pick a
// filter, rotate, or drop the page entirely.
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
  const svgRef = useRef(null);

  const { width, height } = page.source;

  useEffect(() => {
    setCorners(page.corners);
    setFilter(page.filter);
    setRotation(page.rotation);
  }, [page.id, page.corners, page.filter, page.rotation]);

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

  const radius = handleRadius(width, height);
  const polygon = CORNER_KEYS.map((key) => `${corners[key].x},${corners[key].y}`).join(" ");

  const commit = () => onCommit({ corners, filter, rotation });

  return (
    <div className="scanner-editor" role="dialog" aria-modal="true" aria-label={`Edit page ${pageNumber}`}>
      <header className="scanner-editor-bar">
        <button type="button" className="scanner-icon-btn" onClick={onClose} aria-label="Discard changes">
          <X size={18} />
        </button>
        <span className="scanner-editor-title">
          Page {pageNumber} of {pageCount}
        </span>
        <button type="button" className="scanner-icon-btn is-primary" onClick={commit} aria-label="Apply changes">
          <Check size={18} />
        </button>
      </header>

      <div className="scanner-editor-stage">
        <div className="scanner-editor-frame" style={{ aspectRatio: `${width} / ${height}` }}>
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
      </div>

      <div className="scanner-editor-tools">
        <div className="scanner-filter-row" role="group" aria-label="Filter">
          {Object.entries(FILTERS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`scanner-chip${filter === key ? " is-selected" : ""}`}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="scanner-editor-actions">
          <button
            type="button"
            className="scanner-chip"
            onClick={() => setRotation((current) => (current + 90) % 360)}
          >
            <RotateCw size={15} aria-hidden="true" /> Rotate
          </button>
          <button
            type="button"
            className="scanner-chip"
            onClick={() => setCorners(defaultCorners(width, height))}
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
