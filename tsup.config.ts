import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  target: "node18",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  // Shim import.meta.url in the CJS output so the data dir resolves in both formats.
  shims: true,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
});
