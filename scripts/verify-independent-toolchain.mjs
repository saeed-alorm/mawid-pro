import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = new URL("../", import.meta.url);
const forbidden = /lovable|__l5e\/assets-v1/i;
function scan(relative) {
  const full = new URL(relative, root);
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) scan(child);
    else if (/\.(?:tsx?|jsx?|mjs|html|json|css)$/.test(entry.name)) {
      assert.ok(
        !forbidden.test(readFileSync(new URL(child, root), "utf8")),
        `Vendor hook/dependency in ${child}`,
      );
    }
  }
}
for (const file of ["package.json", "package-lock.json", "vite.config.ts"]) {
  assert.ok(
    !forbidden.test(readFileSync(new URL(file, root), "utf8")),
    `Vendor reference in ${file}`,
  );
}
assert.ok(!existsSync(new URL(".lovable", root)), "Remove obsolete project metadata");
scan("src");
scan("dist/client");
console.log("Independent source, dependency lock and built client verified.");
