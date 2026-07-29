import React, { useEffect, useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import api from "../api.js";

const timeOf = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const activityOf = (tag) =>
  timeOf(tag?.lastActivityAt || tag?.updatedAt) || timeOf(tag?.date || tag?.createdAt);

// Compact tag chooser for the scanner's save step. Hidden tags are included
// because they are valid upload targets, same as on the upload screen.
const TagPicker = ({ value, onChange, disabled = false }) => {
  const [tags, setTags] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.myTags(true), api.me().catch(() => null)])
      .then(([tagResult, userResult]) => {
        if (cancelled) return;
        setTags(tagResult?.tags || []);
        setFavorites(userResult?.user?.favoriteTags || []);
        setLoading(false);
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError.message || "Could not load your tags");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const names = useMemo(() => {
    const unique = new Map();
    tags.forEach((tag) => {
      const item =
        typeof tag === "string"
          ? { name: tag.trim() }
          : { ...tag, name: typeof tag?.name === "string" ? tag.name.trim() : "" };
      if (item.name && !unique.has(item.name)) unique.set(item.name, item);
    });

    const favoriteSet = new Set(favorites);
    return Array.from(unique.values())
      .sort((a, b) => {
        const favoriteDelta = Number(favoriteSet.has(b.name)) - Number(favoriteSet.has(a.name));
        if (favoriteDelta) return favoriteDelta;
        return activityOf(b) - activityOf(a) || a.name.localeCompare(b.name);
      })
      .map((tag) => ({ name: tag.name, favorite: favoriteSet.has(tag.name) }));
  }, [tags, favorites]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? names.filter((tag) => tag.name.toLowerCase().includes(needle)) : names;
  }, [names, query]);

  if (loading) {
    return <p className="scanner-hint">Loading your tags…</p>;
  }

  if (error) {
    return <p className="scanner-error">{error}</p>;
  }

  if (!names.length) {
    return (
      <p className="scanner-hint">
        You have no tags yet. Create one first, then come back to save this scan.
      </p>
    );
  }

  return (
    <div className="scanner-tagpicker">
      <div className="scanner-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search tags"
          aria-label="Search tags"
          disabled={disabled}
        />
      </div>

      <div className="scanner-tag-list" role="radiogroup" aria-label="Destination tag">
        {filtered.map((tag) => (
          <button
            key={tag.name}
            type="button"
            role="radio"
            aria-checked={value === tag.name}
            className={`scanner-tag${value === tag.name ? " is-selected" : ""}`}
            onClick={() => onChange(tag.name)}
            disabled={disabled}
          >
            {tag.favorite ? <Star size={13} aria-hidden="true" /> : null}
            <span>{tag.name}</span>
          </button>
        ))}
        {!filtered.length ? <p className="scanner-hint">No tags match “{query}”.</p> : null}
      </div>
    </div>
  );
};

export default TagPicker;
