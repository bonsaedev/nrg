import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.shared";
import { defaultConfig } from "./packages/toolkit/src/test/client/e2e";

export default defineConfig({
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
    },
  },
  test: {
    ...defaultConfig,
    include: ["tests/core/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/core/client/e2e/global-setup.ts"],
  },
});
