import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

const VIDEO_EXTS = ["mp4", "m4v", "webm", "mov", "ogv", "ogg"];

const getExt = (name = "") => {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
};

export const isImageName = (name = "") =>
  ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"].includes(getExt(name));

export const isVideoName = (name = "") => VIDEO_EXTS.includes(getExt(name));

export const isViewableName = (name = "") => isImageName(name) || isVideoName(name);

// Full-screen media viewer. Manual navigation only (arrows / swipe / keyboard),
// media fills the viewport at its natural aspect ratio, chrome fades while idle.
const Lightbox = ({ items, index, onNavigate, onClose }) => {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const idleTimer = useRef(null);
  const touchStart = useRef(null);

  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate(index - 1);
  }, [index, onNavigate]);

  const goNext = useCallback(() => {
    if (index < items.length - 1) onNavigate(index + 1);
  }, [index, items.length, onNavigate]);

  // Reset the load fade whenever the shown item changes.
  useEffect(() => {
    setLoaded(false);
  }, [index]);

  // Keyboard: arrows navigate, Escape closes.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Fade chrome after inactivity; any pointer movement brings it back.
  const wakeControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setControlsVisible(false), 2600);
  }, []);

  useEffect(() => {
    wakeControls();
    return () => idleTimer.current && clearTimeout(idleTimer.current);
  }, [wakeControls, index]);

  const onTouchStart = (e) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };

  const onTouchEnd = (e) => {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  if (!item) return null;

  return (
    <div
      className={`lightbox ${controlsVisible ? "chrome-on" : "chrome-off"}`}
      onMouseMove={wakeControls}
      role="dialog"
      aria-modal="true"
    >
      {/* click the dim backdrop (outside the media) to close */}
      <div className="lightbox-backdrop" onClick={onClose} />

      <div
        className="lightbox-stage"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {isVideoName(item.name) ? (
          <video
            key={item.url}
            className="lightbox-media"
            src={item.url}
            controls
            autoPlay
            playsInline
            onLoadedData={() => setLoaded(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        ) : (
          <img
            key={item.url}
            className="lightbox-media"
            src={item.url}
            alt={item.name}
            onLoad={() => setLoaded(true)}
            style={{ opacity: loaded ? 1 : 0 }}
          />
        )}
      </div>

      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      <div className="lightbox-caption">
        <span className="lightbox-name" title={item.name}>{item.name}</span>
        {items.length > 1 && (
          <span className="lightbox-counter">{index + 1} / {items.length}</span>
        )}
      </div>

      {hasPrev && (
        <button
          className="lightbox-arrow lightbox-arrow-left"
          onClick={goPrev}
          aria-label="Previous"
        >
          <ChevronLeft size={26} />
        </button>
      )}
      {hasNext && (
        <button
          className="lightbox-arrow lightbox-arrow-right"
          onClick={goNext}
          aria-label="Next"
        >
          <ChevronRight size={26} />
        </button>
      )}
    </div>
  );
};

export default Lightbox;
