import { defineConfig } from "vitest/config";
import { defaultConfig } from "./src/test/client/e2e";

export default defineConfig({
  test: {
    ...defaultConfig,
    include: ["tests/core/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/core/client/e2e/global-setup.ts"],
  },
});
