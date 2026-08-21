import { copyFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = path.join(projectRoot, "dist", "client");
const indexPath = path.join(publicDir, "index.html");

if (!existsSync(indexPath)) {
  throw new Error("GitHub Pages build did not produce dist/client/index.html");
}

copyFileSync(indexPath, path.join(publicDir, "404.html"));
writeFileSync(path.join(publicDir, ".nojekyll"), "", "utf8");

console.log("Created GitHub Pages fallback and .nojekyll marker.");
