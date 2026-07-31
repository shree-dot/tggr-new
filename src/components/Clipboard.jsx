import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ClipboardCopy,
  ClipboardPaste,
  ExternalLink,
  Loader2,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import api from "../api.js";
import "../clipboard.css";

const SEARCH_DEBOUNCE_MS = 250;
// Long entries collapse to this many lines until expanded.
const PREVIEW_LINES = 6;

const timeAgo = (iso) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

const isLink = (body) => /^https?:\/\/\S+$/i.test(body.trim());

// navigator.clipboard needs a secure context and is missing on older mobile
// browsers, so fall back to the old selection trick rather than failing.
const copyText = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};

const Clipboard = () => {
  const [clips, setClips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const [draft, setDraft] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  const [copiedId, setCopiedId] = useState(null);
  const [editing, setEditing] = useState(null); // { id, body, label }
  const [expanded, setExpanded] = useState(() => new Set());
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const composerRef = useRef(null);

  const load = useCallback(
    (search = "", { quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      return api
        .clips(search)
        .then(({ clips: rows }) => {
          setClips(rows);
          setError("");
        })
        .catch((loadError) => setError(loadError.message || "Could not load your clipboard"))
        .finally(() => setLoading(false));
    },
    []
  );

  useEffect(() => {
    load(activeQuery);
  }, [load, activeQuery]);

  // Debounce so typing a search does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setActiveQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // Something copied on another device should appear when you come back to this
  // tab, without a manual refresh and without polling in the background.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") load(activeQuery, { quiet: true });
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, activeQuery]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const save = async () => {
    const body = draft.trim();
    if (!body || saving) return;

    setSaving(true);
    try {
      const { clip, deduped } = await api.createClip({ body: draft, label });
      setClips((current) => [clip, ...current.filter((item) => item.id !== clip.id)]);
      setDraft("");
      setLabel("");
      setNotice(deduped ? "Already saved — moved back to the top" : "Saved to your clipboard");
      composerRef.current?.focus();
    } catch (saveError) {
      setError(saveError.message || "Could not save that");
    } finally {
      setSaving(false);
    }
  };

  const pasteFromDevice = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        setNotice("Your device clipboard is empty");
        return;
      }
      setDraft(text);
      composerRef.current?.focus();
    } catch {
      setNotice("Your browser blocked clipboard access — paste into the box instead");
    }
  };

  const copy = async (clip) => {
    const ok = await copyText(clip.body);
    if (!ok) {
      setNotice("Could not copy — select the text and copy manually");
      return;
    }
    setCopiedId(clip.id);
    setTimeout(() => setCopiedId((current) => (current === clip.id ? null : current)), 1600);
  };

  const togglePin = async (clip) => {
    setBusyId(clip.id);
    try {
      const { clip: updated } = await api.updateClip(clip.id, { pinned: !clip.pinned });
      setClips((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (pinError) {
      setError(pinError.message || "Could not update that");
    } finally {
      setBusyId(null);
    }
  };

  const commitEdit = async () => {
    if (!editing?.body.trim()) return;
    setBusyId(editing.id);
    try {
      const { clip } = await api.updateClip(editing.id, {
        body: editing.body,
        label: editing.label,
      });
      setClips((current) => current.map((item) => (item.id === clip.id ? clip : item)));
      setEditing(null);
    } catch (editError) {
      setError(editError.message || "Could not save that");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (clip) => {
    setBusyId(clip.id);
    try {
      await api.deleteClip(clip.id);
      setClips((current) => current.filter((item) => item.id !== clip.id));
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete that");
    } finally {
      setBusyId(null);
    }
  };

  const clearUnpinned = async () => {
    try {
      const { deleted } = await api.clearClips();
      setClips((current) => current.filter((item) => item.pinned));
      setNotice(`Cleared ${deleted} entr${deleted === 1 ? "y" : "ies"}`);
    } catch (clearError) {
      setError(clearError.message || "Could not clear the clipboard");
    } finally {
      setConfirmClear(false);
    }
  };

  const pinned = useMemo(() => clips.filter((clip) => clip.pinned), [clips]);
  const recent = useMemo(() => clips.filter((clip) => !clip.pinned), [clips]);
  const unpinnedCount = recent.length;

  const renderClip = (clip) => {
    const isEditing = editing?.id === clip.id;
    const lines = clip.body.split("\n");
    const isLong = lines.length > PREVIEW_LINES || clip.body.length > 400;
    const isOpen = expanded.has(clip.id);

    return (
      <li key={clip.id} className={`clip${clip.pinned ? " is-pinned" : ""}`}>
        <div className="clip-head">
          <div className="clip-meta">
            {clip.label ? <span className="clip-label">{clip.label}</span> : null}
            <span className="clip-time" title={new Date(clip.updatedAt).toLocaleString()}>
              {timeAgo(clip.updatedAt)}
            </span>
          </div>

          <div className="clip-actions">
            <button
              type="button"
              className={`clip-btn${copiedId === clip.id ? " is-done" : ""}`}
              onClick={() => copy(clip)}
              aria-label={`Copy ${clip.label || "entry"}`}
            >
              {copiedId === clip.id ? <Check size={15} /> : <ClipboardCopy size={15} />}
              <span>{copiedId === clip.id ? "Copied" : "Copy"}</span>
            </button>

            {isLink(clip.body) ? (
              <a
                className="clip-btn"
                href={clip.body.trim()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open link"
              >
                <ExternalLink size={15} />
              </a>
            ) : null}

            <button
              type="button"
              className={`clip-btn${clip.pinned ? " is-active" : ""}`}
              onClick={() => togglePin(clip)}
              disabled={busyId === clip.id}
              aria-pressed={clip.pinned}
              aria-label={clip.pinned ? "Unpin" : "Pin"}
            >
              {clip.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            </button>

            <button
              type="button"
              className="clip-btn"
              onClick={() => setEditing({ id: clip.id, body: clip.body, label: clip.label })}
              disabled={busyId === clip.id}
              aria-label="Edit"
            >
              <Pencil size={15} />
            </button>

            <button
              type="button"
              className="clip-btn is-danger"
              onClick={() => remove(clip)}
              disabled={busyId === clip.id}
              aria-label="Delete"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="clip-edit">
            <input
              type="text"
              value={editing.label}
              placeholder="Label (optional)"
              onChange={(event) => setEditing({ ...editing, label: event.target.value })}
            />
            <textarea
              value={editing.body}
              rows={Math.min(14, Math.max(3, editing.body.split("\n").length + 1))}
              onChange={(event) => setEditing({ ...editing, body: event.target.value })}
            />
            <div className="clip-edit-actions">
              <button type="button" className="clip-ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="clip-primary"
                onClick={commitEdit}
                disabled={busyId === clip.id || !editing.body.trim()}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <pre className={`clip-body${isLong && !isOpen ? " is-clamped" : ""}`}>{clip.body}</pre>
            {isLong ? (
              <button
                type="button"
                className="clip-more"
                onClick={() =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(clip.id)) next.delete(clip.id);
                    else next.add(clip.id);
                    return next;
                  })
                }
              >
                {isOpen ? "Show less" : `Show all ${lines.length} lines`}
              </button>
            ) : null}
          </>
        )}
      </li>
    );
  };

  return (
    <div className="clipboard-shell">
      <header className="clipboard-head">
        <h1 className="clipboard-title">Clipboard</h1>
        <p className="clipboard-sub">
          Private to you. Paste here on one device, copy it from another.
        </p>
      </header>

      <section className="clipboard-composer panel-shell">
        <textarea
          ref={composerRef}
          className="clipboard-input"
          value={draft}
          rows={4}
          placeholder="Paste or type anything you want to pick up elsewhere…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
        <div className="clipboard-composer-row">
          <input
            type="text"
            className="clipboard-label-input"
            value={label}
            placeholder="Label (optional)"
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
          />
          <button type="button" className="clip-ghost" onClick={pasteFromDevice}>
            <ClipboardPaste size={15} aria-hidden="true" /> Paste
          </button>
          <button
            type="button"
            className="clip-primary"
            onClick={save}
            disabled={!draft.trim() || saving}
          >
            {saving ? <Loader2 className="clip-spin" size={15} /> : <Plus size={15} />}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <p className="clipboard-hint">
          {navigator.platform?.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}+Enter saves.
        </p>
      </section>

      {notice ? <p className="clipboard-notice" role="status">{notice}</p> : null}
      {error ? <p className="clipboard-error">{error}</p> : null}

      <div className="clipboard-toolbar">
        <div className="clipboard-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder="Search your clipboard"
            aria-label="Search your clipboard"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {unpinnedCount > 0 && !activeQuery ? (
          <button type="button" className="clip-ghost" onClick={() => setConfirmClear(true)}>
            <Trash2 size={15} aria-hidden="true" /> Clear unpinned
          </button>
        ) : null}
      </div>

      {loading ? (
        <p className="clipboard-empty">
          <Loader2 className="clip-spin" size={18} aria-hidden="true" /> Loading…
        </p>
      ) : null}

      {!loading && !clips.length ? (
        <p className="clipboard-empty">
          {activeQuery
            ? `Nothing matches “${activeQuery}”.`
            : "Nothing saved yet. Paste something above and it will be waiting on your other devices."}
        </p>
      ) : null}

      {pinned.length ? (
        <section className="clipboard-group">
          <h2 className="clipboard-group-title">
            <Pin size={13} aria-hidden="true" /> Pinned
          </h2>
          <ul className="clip-list">{pinned.map(renderClip)}</ul>
        </section>
      ) : null}

      {recent.length ? (
        <section className="clipboard-group">
          {pinned.length ? <h2 className="clipboard-group-title">Recent</h2> : null}
          <ul className="clip-list">{recent.map(renderClip)}</ul>
        </section>
      ) : null}

      {confirmClear ? (
        <div className="clipboard-confirm" role="dialog" aria-modal="true" aria-label="Clear clipboard">
          <div className="clipboard-confirm-card">
            <h3>Clear unpinned entries?</h3>
            <p>
              This deletes {unpinnedCount} entr{unpinnedCount === 1 ? "y" : "ies"}. Pinned entries
              are kept. This cannot be undone.
            </p>
            <div className="clip-edit-actions">
              <button type="button" className="clip-ghost" onClick={() => setConfirmClear(false)}>
                <X size={15} aria-hidden="true" /> Cancel
              </button>
              <button type="button" className="clip-danger" onClick={clearUnpinned}>
                <Trash2 size={15} aria-hidden="true" /> Clear
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Clipboard;
