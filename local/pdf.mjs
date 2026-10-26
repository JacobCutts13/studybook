import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";

const require = createRequire(import.meta.url);
const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");
const standardFontDataUrl = `${dirname(require.resolve("pdfjs-dist/package.json"))}/standard_fonts/`;

// Returns one array of text lines per page (index 0 is PDF page 1).
export async function readPageLines(path) {
  const data = new Uint8Array(await readFile(path));
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    standardFontDataUrl,
    verbosity: 0,
  }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    let text = "";
    for (const item of content.items) {
      text += item.str;
      if (item.hasEOL) text += "\n";
    }
    pages.push(
      text
        .split("\n")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    );
  }
  await doc.destroy();
  return pages;
}

// Drops page-number lines and running headers/footers (lines on >40% of
// pages). Digits are ignored when comparing, so "Title 23" matches "Title 24".
export function cleanPages(pages) {
  const key = (line) => line.replace(/\d+/g, "#");
  const counts = new Map();
  for (const lines of pages)
    for (const k of new Set(lines.map(key)))
      counts.set(k, (counts.get(k) ?? 0) + 1);
  const limit = Math.max(2, 0.4 * pages.length);
  return pages.map((lines) =>
    lines.filter(
      (line) => !/^\d+$/.test(line) && (counts.get(key(line)) ?? 0) <= limit,
    ),
  );
}
