import { defineConfig } from "vitest/config";
import path from "path";
import { playwright } from "@vitest/browser-playwright";
import { defaultConfig } from "./src/test/client/unit";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
    },
  },
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
