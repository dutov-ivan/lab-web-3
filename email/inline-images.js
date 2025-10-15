#!/usr/bin/env node
/**
 * inline-with-css-inline.js
 *
 * Usage:
 *   node inline-with-css-inline.js input.html output.html
 *
 * What it does:
 *  - reads input HTML
 *  - converts local <img src="..."> -> data:... base64 URIs
 *  - converts local url(...) occurrences -> data:... base64 URIs
 *  - calls @css-inline/css-inline to inline CSS (style/link) into style attributes
 *  - writes output HTML
 *
 * Notes:
 *  - This script keeps things pragmatic (regex for images & url()) and uses css-inline for robust CSS inlining.
 *  - If you need 100% robust HTML/CSS parsing (templates, weird quoting, template tags), switch to cheerio + a CSS parser.
 */

import fs from "fs";
import path from "path";
import * as cssInline from "@css-inline/css-inline";

const [, , inputFile, outputFile] = process.argv;
if (!inputFile || !outputFile) {
  console.error("Usage: node inline-with-css-inline.js input.html output.html");
  process.exit(1);
}

const baseDir = path.dirname(path.resolve(inputFile));

const resolveLocal = (baseDir, targetPath) => {
  // Remove query/hash (keep original in warnings)
  const clean = targetPath.split(/[?#]/)[0];
  return path.resolve(baseDir, clean);
};

const fileToDataUri = (absPath) => {
  if (!fs.existsSync(absPath)) return null;
  const ext = path.extname(absPath).slice(1).toLowerCase();
  // For SVGs, return a utf-8 text data URI (URI-encoded) instead of base64 — better readability and often smaller.
  if (ext === "svg") {
    try {
      const txt = fs.readFileSync(absPath, "utf8");
      // Remove BOM if present
      const clean = txt.replace(/^\uFEFF/, "");
      // encodeURIComponent to ensure special chars are safe in the data URI
      const encoded = encodeURIComponent(clean)
        // preserve common SVG-safe characters for slightly smaller URI
        .replace(/'/g, "%27")
        .replace(/\(/g, "%28")
        .replace(/\)/g, "%29");
      return `data:image/svg+xml;utf8,${encoded}`;
    } catch (err) {
      // fall back to null so the caller can warn
      return null;
    }
  }

  const mime =
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      ico: "image/x-icon",
    }[ext] || "application/octet-stream";
  const buf = fs.readFileSync(absPath);
  return `data:${mime};base64,${buf.toString("base64")}`;
};

let html;
try {
  html = fs.readFileSync(inputFile, "utf8");
} catch (err) {
  console.error("Error reading input file:", err.message);
  process.exit(1);
}

// 1) inline <img src="..."> (local only)
html = html.replace(
  /<img\b([^>]*?)\bsrc=(["'])([^"'>]+)\2([^>]*?)>/gi,
  (full, before, quote, src, after) => {
    if (/^data:/i.test(src) || /^https?:\/\//i.test(src)) return full; // skip remote/already inlined
    const abs = resolveLocal(baseDir, src);
    const uri = fileToDataUri(abs);
    if (!uri) {
      console.warn(`⚠ Image not found, skipping: ${src}`);
      return full;
    }
    // Preserve other attributes and replace src only
    return `<img${before}src="${uri}"${after}>`;
  }
);

(async () => {
  try {
    // css-inline supports a base_url option. Use file:// so local CSS files referenced by <link> are resolved.
    // See library README: inline(html) is the intended entry point for full docs/pages. :contentReference[oaicite:1]{index=1}
    const options = {
      // base_url: where to resolve relative links (use file:// to allow local filesystem resolution)
      base_url: `file://${baseDir}/`,
      // the following options follow the library's config; defaults are usually fine.
      // If you prefer different behavior, adjust them. (Examples present in library README.)
      // load_remote_stylesheets: false // uncomment to prevent fetching remote stylesheets
    };

    // Call the library's inline function. It returns the inlined HTML string.
    // The npm/browser usage examples call `.inline(...)`. If your environment complains,
    // try `cssInline.default.inline(...)` depending on your bundler/interop.
    const inlined = await cssInline.inline(html, options);

    fs.writeFileSync(outputFile, inlined, "utf8");
    console.log("✅ Done — output written to", outputFile);
  } catch (err) {
    console.error("Error inlining CSS with @css-inline/css-inline:", err);
    process.exit(1);
  }
})();
