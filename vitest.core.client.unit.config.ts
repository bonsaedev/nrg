import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";
import { defaultConfig } from "./src/test/client/unit";

export default defineConfig({
  plugins: [vue()],
  test: {
    ...defaultConfig,
    setupFiles: ["tests/core/client/unit/setup.ts"],
    include: ["tests/core/client/unit/**/*.test.ts"],
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
