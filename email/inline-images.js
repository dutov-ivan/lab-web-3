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
    return `<img${before}src="${uri}"${after}>`;
  }
);

(async () => {
  try {
    const options = {
      base_url: `file://${baseDir}/`,
    };

    const inlined = await cssInline.inline(html, options);

    fs.writeFileSync(outputFile, inlined, "utf8");
    console.log("✅ Done — output written to", outputFile);
  } catch (err) {
    console.error("Error inlining CSS with @css-inline/css-inline:", err);
    process.exit(1);
  }
})();
