import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The golden parity suite touches the full lexicon (root tables are large).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
