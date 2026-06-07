import { defineConfig } from "vitest/config";
import path from "path";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";
import { defaultConfig } from "./src/test/client/component";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
    },
  },
  test: {
    ...defaultConfig,
    setupFiles: ["tests/core/client/component/setup.ts"],
    include: ["tests/core/client/component/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reportsDirectory: "coverage/client-component",
      reporter: ["text", "lcov"],
      include: ["src/core/client/form/components/**/*.{ts,vue}"],
    },
    browser: {
      ...defaultConfig.browser,
      instances: [
        { browser: "chromium" },
        { browser: "firefox" },
        { browser: "webkit" },
      ],
      provider: playwright(),
    },
  },
});
