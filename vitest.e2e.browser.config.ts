import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/e2e/browser/**/*.test.ts"],
    globalSetup: ["tests/e2e/browser/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
