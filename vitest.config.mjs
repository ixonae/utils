import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["web_utils/tests/**/*.test.js"],
    globals: true,
    coverage: {
      reporter: ["text", "html", "clover", "json", "lcov"],
      exclude: ["web_utils/tests/**"],
    },
  },
});
