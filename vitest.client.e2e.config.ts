import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/client/e2e/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
