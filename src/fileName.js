// Split a filename into an editable base and a fixed extension.
// "IMG_1234.jpg" -> { base: "IMG_1234", ext: ".jpg" }
// "notes"        -> { base: "notes", ext: "" }
// A leading dot (".env") is treated as part of the base, not an extension.
export const splitFileName = (name = "") => {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) {
    return { base: name, ext: "" };
  }
  return { base: name.slice(0, idx), ext: name.slice(idx) };
};
