import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "packages/runtime/src"),
      "@/vite": path.resolve(__dirname, "packages/toolkit/src/vite"),
      "@/test": path.resolve(__dirname, "packages/toolkit/src/test"),
      "@bonsae/nrg-runtime/internal/client": path.resolve(__dirname, "packages/runtime/src/internal-client.ts"),
      "@bonsae/nrg-runtime/internal/components": path.resolve(__dirname, "packages/runtime/src/internal-components.ts"),
      "@bonsae/nrg-runtime/internal": path.resolve(__dirname, "packages/runtime/src/internal.ts"),
      "@bonsae/nrg-runtime/server": path.resolve(__dirname, "packages/runtime/src/server/index.ts"),
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
