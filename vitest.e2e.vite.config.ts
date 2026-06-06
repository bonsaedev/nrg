import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/**/*.test.ts"],
    exclude: ["tests/e2e/browser/**"],
    globalSetup: ["tests/e2e/vite/global-setup.ts"],
    testTimeout: 30000,
  },
});
