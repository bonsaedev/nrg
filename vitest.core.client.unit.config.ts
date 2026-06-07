import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { defaultConfig } from "./src/test/client/unit";

export default defineConfig({
  test: {
    ...defaultConfig,
    setupFiles: ["tests/core/client/unit/setup.ts"],
    include: ["tests/core/client/unit/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reportsDirectory: "coverage/client-unit",
      reporter: ["text", "lcov"],
      include: ["src/core/client/validation.ts"],
    },
    browser: {
      ...defaultConfig.browser,
      instances: [{ browser: "chromium" }],
      provider: playwright(),
    },
  },
});
