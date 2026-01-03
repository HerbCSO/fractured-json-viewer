#!/usr/bin/env node
import fs from "node:fs/promises";

const bump = process.argv[2] ?? "patch";
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: node scripts/bump-version.mjs [patch|minor|major]");
  process.exit(2);
}

function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(v);
  if (!m) throw new Error(`Unsupported version format: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}
function fmt({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}
function bumpSemver(v, kind) {
  const s = parseSemver(v);
  if (kind === "major") return fmt({ major: s.major + 1, minor: 0, patch: 0 });
  if (kind === "minor") return fmt({ major: s.major, minor: s.minor + 1, patch: 0 });
  return fmt({ major: s.major, minor: s.minor, patch: s.patch + 1 });
}

const pkgPath = "package.json";
const manPath = "manifest.json";

const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
const manifest = JSON.parse(await fs.readFile(manPath, "utf8"));

if (!pkg.version) throw new Error("package.json is missing version");
const next = bumpSemver(pkg.version, bump);

pkg.version = next;
manifest.version = next;

await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
await fs.writeFile(manPath, JSON.stringify(manifest, null, 2) + "\n");

console.log(next);
