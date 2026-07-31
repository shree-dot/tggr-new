// Splits text into plain runs and link runs so clipboard entries can render
// clickable URLs without ever going near dangerouslySetInnerHTML.
//
// Only http/https and bare `www.` are recognised. That is deliberate: hrefs are
// built exclusively from matches of this pattern, so a `javascript:` or `data:`
// URL in a pasted entry can never become a clickable link.

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+/gi;

// Sentence punctuation sits directly against a URL far more often than it
// belongs to one, so peel it off the end.
const TRAILING = new Set([".", ",", ";", ":", "!", "?", "'", '"', "”", "’"]);

const CLOSERS = { ")": "(", "]": "[", "}": "{" };

const trimTrailing = (url) => {
  let end = url.length;

  while (end > 0) {
    const char = url[end - 1];

    if (TRAILING.has(char)) {
      end -= 1;
      continue;
    }

    // A closing bracket only belongs to the URL if it was opened inside it —
    // "(see https://x.com/a)" ends the link before the paren, but
    // "https://en.wikipedia.org/wiki/Foo_(bar)" keeps it.
    const opener = CLOSERS[char];
    if (opener) {
      // Count over the text *before* this bracket — including it would make
      // every balanced pair look like depth 0 and strip the closer.
      const slice = url.slice(0, end - 1);
      let depth = 0;
      for (const candidate of slice) {
        if (candidate === opener) depth += 1;
        else if (candidate === char) depth -= 1;
      }
      if (depth <= 0) {
        end -= 1;
        continue;
      }
    }

    break;
  }

  return url.slice(0, end);
};

/**
 * Returns an array of `string` (plain text) and `{ href, text }` (link) parts,
 * in order, that together reconstruct the input exactly.
 */
export const linkify = (text) => {
  if (typeof text !== "string" || !text) return [];

  const parts = [];
  let lastIndex = 0;

  // Reset: the regex is module-level and stateful because of the /g flag.
  URL_PATTERN.lastIndex = 0;

  let match = URL_PATTERN.exec(text);
  while (match) {
    const raw = match[0];
    const url = trimTrailing(raw);

    // Everything trimmed away is punctuation, not part of the link.
    if (url) {
      if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
      parts.push({
        href: /^www\./i.test(url) ? `https://${url}` : url,
        text: url,
      });
      lastIndex = match.index + url.length;
    }

    match = URL_PATTERN.exec(text);
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
};

// True when the entry is nothing but a single link, which earns it a dedicated
// Open button rather than only an inline anchor.
export const isBareLink = (text) => {
  const trimmed = (text || "").trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  const parts = linkify(trimmed);
  return parts.length === 1 && typeof parts[0] === "object" && parts[0].text === trimmed;
};
