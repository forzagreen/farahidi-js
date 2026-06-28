// Copy the bundled gzip JSONL lexicon tables next to the compiled output so they
// can be loaded at runtime relative to dist/index.{js,cjs}.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const from = resolve(here, "../src/data");
const to = resolve(here, "../dist/data");

if (!existsSync(from)) {
  throw new Error(`bundled data not found at ${from}`);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log(`copied bundled data -> ${to}`);
