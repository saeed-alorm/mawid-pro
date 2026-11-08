import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
function git(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
writeFileSync(
  "dist/client/build-provenance.json",
  JSON.stringify(
    {
      kind: "fictional-public-web-prototype",
      platform: "web-github-pages",
      version: pkg.version ?? null,
      tag: git(["describe", "--tags", "--exact-match", "HEAD"]),
      commit: git(["rev-parse", "HEAD"]),
      source_dirty: Boolean(git(["status", "--porcelain"])),
      lock_sha256: createHash("sha256").update(readFileSync("package-lock.json")).digest("hex"),
      node: process.version,
      command: "npm run build:pages",
      generated_at: new Date().toISOString(),
      acceptance: "CI/build success is not production or pilot acceptance",
    },
    null,
    2,
  ) + "\n",
);
