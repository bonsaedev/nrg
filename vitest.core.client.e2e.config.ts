import { defineConfig } from "vitest/config";
import path from "path";
import { defaultConfig } from "./src/test/client/e2e";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    ...defaultConfig,
    include: ["tests/core/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/core/client/e2e/global-setup.ts"],
  },
});
