import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import { defaultConfig } from "./src/test/client/component/config";

export default mergeConfig(defaultConfig, defineConfig({
  resolve: {
    alias: {
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
    },
  },
  test: {
    setupFiles: ["tests/core/client/component/setup.ts"],
    include: ["tests/core/client/component/**/*.test.ts"],
    coverage: {
      provider: "istanbul",
      reportsDirectory: "coverage/client-component",
      reporter: ["text", "lcov"],
      include: ["src/core/client/form/components/**/*.{ts,vue}"],
    },
  },
}));
