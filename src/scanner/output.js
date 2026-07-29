// Turns rendered scan pages into the file(s) that get uploaded.

import { PDFDocument } from "pdf-lib";

const A4_WIDTH_PT = 595.28;

const pad = (value) => String(value).padStart(2, "0");

export const defaultScanName = (date = new Date()) =>
  `Scan-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}`;

// Strips anything that would upset a filesystem or the server's name handling.
// Leading dots matter: the upload endpoint rejects dotfile names outright.
export const sanitiseBaseName = (name) => {
  const cleaned = (name || "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || defaultScanName();
};

// Each page keeps the aspect of its scan and is laid out at A4 width, so the
// document prints sensibly without letterboxing the image.
export const buildPdf = async (pages, baseName) => {
  const pdf = await PDFDocument.create();
  pdf.setTitle(baseName);
  pdf.setCreator("tggr scanner");

  for (const page of pages) {
    const bytes = await page.blob.arrayBuffer();
    const image = await pdf.embedJpg(bytes);
    const height = (A4_WIDTH_PT * image.height) / image.width;
    const pdfPage = pdf.addPage([A4_WIDTH_PT, height]);
    pdfPage.drawImage(image, { x: 0, y: 0, width: A4_WIDTH_PT, height });
  }

  const bytes = await pdf.save();
  return new File([bytes], `${baseName}.pdf`, { type: "application/pdf" });
};

export const buildImages = (pages, baseName) =>
  pages.map((page, index) => {
    const suffix = pages.length > 1 ? `-${pad(index + 1)}` : "";
    return new File([page.blob], `${baseName}${suffix}.jpg`, { type: "image/jpeg" });
  });
