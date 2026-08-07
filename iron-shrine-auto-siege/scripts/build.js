import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist");
const files = [
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "sw.js",
  "assets",
  "js"
];

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const file of files) cpSync(resolve(root, file), resolve(output, file), { recursive: true });
console.log(`Static build complete: ${files.length} entries copied to dist/`);
