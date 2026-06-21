import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.shared";
import { defaultConfig } from "./packages/toolkit/src/test/client/e2e/config";

export default defineConfig({
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
    },
  },
  test: {
    ...defaultConfig.test,
    include: ["tests/core/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/core/client/e2e/global-setup.ts"],
  },
});
