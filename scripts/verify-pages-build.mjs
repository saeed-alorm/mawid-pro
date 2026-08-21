import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, "dist", "client");
const indexPath = path.join(publicDir, "index.html");
const fallbackPath = path.join(publicDir, "404.html");
const noJekyllPath = path.join(publicDir, ".nojekyll");

assert.ok(existsSync(indexPath), "GitHub Pages build must emit dist/client/index.html");
assert.ok(existsSync(fallbackPath), "GitHub Pages build must emit dist/client/404.html");
assert.ok(existsSync(noJekyllPath), "GitHub Pages build must emit dist/client/.nojekyll");

const indexHtml = readFileSync(indexPath, "utf8");
const fallbackHtml = readFileSync(fallbackPath, "utf8");

assert.match(
  indexHtml,
  /(?:src|href)="\/mawid-pro\//,
  "GitHub Pages assets must use the /mawid-pro/ repository base path",
);
assert.doesNotMatch(
  indexHtml,
  /(?:src|href)="\/(?!mawid-pro\/)/,
  "GitHub Pages HTML must not contain root-relative assets outside /mawid-pro/",
);
assert.match(
  indexHtml,
  /data-mawid-boot-loader="true"/,
  "GitHub Pages HTML must include the branded MAWID boot loader before hydration",
);
assert.equal(fallbackHtml, indexHtml, "404.html must duplicate the SPA entry document");

console.log(
  "Verified GitHub Pages entry, fallback, base path, branded loader, and .nojekyll output.",
);
