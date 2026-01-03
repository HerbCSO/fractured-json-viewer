#!/usr/bin/env node
// SPDX-License-Identifier: MIT
import fs from "node:fs/promises";

const pkg = JSON.parse(await fs.readFile("package.json", "utf8"));
const manifest = JSON.parse(await fs.readFile("manifest.json", "utf8"));

if (!pkg.version) throw new Error("package.json missing version");
if (!manifest.version) throw new Error("manifest.json missing version");

if (pkg.version !== manifest.version) {
  throw new Error(`Version mismatch: package.json=${pkg.version} manifest.json=${manifest.version}`);
}

console.log(`OK: version ${pkg.version}`);
