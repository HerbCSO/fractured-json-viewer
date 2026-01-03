// SPDX-License-Identifier: MIT

import { build } from "esbuild";
import { mkdir, cp, rm, stat } from "node:fs/promises";
import path from "node:path";

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dst) {
  await ensureDir(path.dirname(dst));
  await cp(src, dst, { recursive: true });
}

async function copyFile(src, dst) {
  await ensureDir(path.dirname(dst));
  await cp(src, dst);
}

// Clean dist
await rm("dist", { recursive: true, force: true });
await ensureDir("dist");

// Copy extension source (your repo files)
const COPY = [
  "manifest.json",
  "background.js",
  "viewer",
  "options",
  "popup",
  "icons"
];

for (const item of COPY) {
  if (!(await exists(item))) continue;
  await copyDir(item, `dist/${item}`);
}

// Vendor fracturedjsonjs (ESM dist)
// Adjust if the library changes its published layout.
await copyDir(
  "node_modules/fracturedjsonjs/dist",
  "dist/vendor/fracturedjsonjs/dist"
);

// Vendor Prism core + json component + one theme css
await copyFile(
  "node_modules/prismjs/prism.js",
  "dist/vendor/prism/prism.js"
);
await copyFile(
  "node_modules/prismjs/components/prism-json.js",
  "dist/vendor/prism/prism-json.js"
);
await copyFile(
  "node_modules/prismjs/themes/prism.css",
  "dist/vendor/prism/prism.css"
);

await build({
  entryPoints: ["node_modules/fracturedjsonjs/dist/index.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: "dist/vendor/fracturedjsonjs/fracturedjson.esm.js",
  sourcemap: false
});

console.log("Bundled fracturedjsonjs to dist/vendor/fracturedjsonjs/fracturedjson.esm.js");

// Optional: prune any dev-only files you might have copied accidentally
// (e.g., source maps, docs). Keep it simple for now.

console.log("Built dist/ with vendored fracturedjsonjs + prismjs");
