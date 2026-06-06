import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    include: ["tests/core/client/unit/**/*.test.ts"],
    setupFiles: ["tests/core/client/unit/setup.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: "chromium" },
        { browser: "firefox" },
        { browser: "webkit" },
      ],
    },
  },
});
