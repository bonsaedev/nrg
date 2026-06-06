import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/vite/e2e/**/*.test.ts"],
    globalSetup: ["tests/vite/e2e/global-setup.ts"],
    testTimeout: 30000,
  },
});
