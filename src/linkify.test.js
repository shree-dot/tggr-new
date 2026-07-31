import { describe, expect, it } from "vitest";
import { isBareLink, linkify } from "./linkify.js";

// Rebuilding the input from the parts must always give back the original, or
// the rendered entry would silently differ from what was pasted.
const roundTrip = (text) =>
  linkify(text)
    .map((part) => (typeof part === "string" ? part : part.text))
    .join("");

const links = (text) => linkify(text).filter((part) => typeof part === "object");

describe("linkify", () => {
  it("finds a url inside a sentence", () => {
    const parts = linkify("see https://example.com for details");
    expect(parts).toEqual([
      "see ",
      { href: "https://example.com", text: "https://example.com" },
      " for details",
    ]);
  });

  it("finds several urls on one line", () => {
    expect(links("https://a.com and https://b.com")).toHaveLength(2);
  });

  it("keeps query strings and fragments", () => {
    const [link] = links("https://example.com/path?a=1&b=2#frag");
    expect(link.text).toBe("https://example.com/path?a=1&b=2#frag");
  });

  it("upgrades bare www. to https", () => {
    expect(links("www.example.com")[0]).toEqual({
      href: "https://www.example.com",
      text: "www.example.com",
    });
  });

  it("drops trailing sentence punctuation", () => {
    expect(links("go to https://example.com.")[0].text).toBe("https://example.com");
    expect(links("https://example.com, then leave")[0].text).toBe("https://example.com");
  });

  it("leaves a wrapping paren out of the link", () => {
    expect(links("(see https://example.com/a)")[0].text).toBe("https://example.com/a");
  });

  it("keeps parens that belong to the url", () => {
    expect(links("https://en.wikipedia.org/wiki/Foo_(bar)")[0].text).toBe(
      "https://en.wikipedia.org/wiki/Foo_(bar)"
    );
  });

  it("ignores text that merely looks domain-ish", () => {
    expect(links("report.txt and version 1.2.3 and example.com")).toHaveLength(0);
  });

  it("never linkifies dangerous schemes", () => {
    expect(links("javascript:alert(1)")).toHaveLength(0);
    expect(links("data:text/html;base64,PHN2Zz4=")).toHaveLength(0);
    expect(links("vbscript:msgbox")).toHaveLength(0);
  });

  it("does not treat a scheme inside a url as a new link", () => {
    expect(links("https://example.com/?next=javascript:alert(1)")).toHaveLength(1);
  });

  it("reconstructs the original text exactly", () => {
    for (const sample of [
      "",
      "no links here",
      "https://example.com",
      "  https://example.com  ",
      "a https://x.com b www.y.com c",
      "(https://example.com/a_(b)).",
      "line one\nhttps://example.com\nline three",
    ]) {
      expect(roundTrip(sample)).toBe(sample);
    }
  });

  it("survives being called repeatedly (regex lastIndex is reset)", () => {
    const text = "https://example.com";
    expect(links(text)).toHaveLength(1);
    expect(links(text)).toHaveLength(1);
    expect(links(text)).toHaveLength(1);
  });

  it("handles non-string input", () => {
    expect(linkify(null)).toEqual([]);
    expect(linkify(undefined)).toEqual([]);
  });
});

describe("isBareLink", () => {
  it("is true for an entry that is only a url", () => {
    expect(isBareLink("https://example.com")).toBe(true);
    expect(isBareLink("  https://example.com  ")).toBe(true);
    expect(isBareLink("www.example.com")).toBe(true);
  });

  it("is false when there is anything else", () => {
    expect(isBareLink("see https://example.com")).toBe(false);
    expect(isBareLink("https://a.com https://b.com")).toBe(false);
    expect(isBareLink("just text")).toBe(false);
    expect(isBareLink("")).toBe(false);
  });

  it("is false when trailing punctuation means the url is not the whole entry", () => {
    expect(isBareLink("https://example.com.")).toBe(false);
  });
});
