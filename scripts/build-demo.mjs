// Build the GitHub Pages demo into ./site:
//   1. bundle demo/browser-entry.ts (+ the compiled dist) with esbuild, stubbing
//      the node builtins the engine imports (never called — data is preloaded);
//   2. copy index.html and the gzip data tables the page fetches.
// Run `npm run build` (tsup) first so ./dist exists.
import { build } from "esbuild";
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const site = resolve(root, "site");

// The engine imports `fs`/`zlib`/`url` (bare, via tsup). In the browser those
// code paths are dead (every table is provided via provideRawText), so we alias
// them to stubs that throw if ever reached.
const stubNodeBuiltins = {
  name: "stub-node-builtins",
  setup(b) {
    const filter = /^(node:)?(fs|zlib|url)$/;
    b.onResolve({ filter }, (args) => ({ path: args.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (args) => {
      const mod = args.path.replace(/^node:/, "");
      const fail = (sym) =>
        `export const ${sym} = () => { throw new Error("${sym}: node builtin unavailable in the browser; preload data via provideRawText()"); };`;
      const contents =
        mod === "url"
          ? "export const fileURLToPath = (u) => String(u);"
          : mod === "fs"
            ? fail("readFileSync")
            : fail("gunzipSync");
      return { contents, loader: "js" };
    });
  },
};

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

await build({
  entryPoints: [resolve(root, "demo/browser-entry.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  sourcemap: true,
  outfile: resolve(site, "app.js"),
  plugins: [stubNodeBuiltins],
  logLevel: "info",
});

copyFileSync(resolve(root, "demo/index.html"), resolve(site, "index.html"));
writeFileSync(resolve(site, ".nojekyll"), ""); // serve files verbatim on Pages

const dataSrc = resolve(root, "src/data");
const dataDst = resolve(site, "data");
mkdirSync(dataDst, { recursive: true });
let n = 0;
for (const f of readdirSync(dataSrc)) {
  if (f.endsWith(".gz")) {
    copyFileSync(resolve(dataSrc, f), resolve(dataDst, f));
    n++;
  }
}
console.log(`demo built -> site/ (app.js + index.html + ${n} data tables)`);
