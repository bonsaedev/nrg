import { defineConfig } from "vitest/config";
import { workspaceAliases } from "./vitest.shared";

export default defineConfig({
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
    },
  },
  test: {
    include: ["tests/vite/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vite",
      reporter: ["text", "lcov"],
      include: [
        "packages/toolkit/src/vite/utils.ts",
        "packages/toolkit/src/vite/async-utils.ts",
        "packages/toolkit/src/vite/errors.ts",
        "packages/toolkit/src/vite/logger.ts",
        "packages/toolkit/src/vite/index.ts",
        "packages/toolkit/src/vite/node-red-launcher/**/*.ts",
        "packages/toolkit/src/vite/client/build.ts",
        "packages/toolkit/src/vite/server/build.ts",
        "packages/toolkit/src/vite/client/plugins/help-generator.ts",
        "packages/toolkit/src/vite/client/plugins/help-i18n.ts",
        "packages/toolkit/src/vite/client/plugins/html-generator.ts",
        "packages/toolkit/src/vite/client/plugins/locales-generator.ts",
        "packages/toolkit/src/vite/client/plugins/minifier.ts",
        "packages/toolkit/src/vite/client/plugins/node-definitions-inliner.ts",
        "packages/toolkit/src/vite/client/plugins/static-copy.ts",
        "packages/toolkit/src/vite/server/plugins/output-wrapper.ts",
        "packages/toolkit/src/vite/server/plugins/package-json-generator.ts",
        "packages/toolkit/src/vite/server/plugins/type-generator.ts",
      ],
    },
  },
});
