import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/sdk/lib": path.resolve(__dirname, "src/sdk/lib"),
      "@/tools/vite": path.resolve(__dirname, "src/tools/vite"),
      "@/sdk/test": path.resolve(__dirname, "src/sdk/test"),
      "@bonsae/nrg-runtime": path.resolve(
        __dirname,
        "src/sdk/lib/runtime.ts",
      ),
      "@bonsae/nrg/server": path.resolve(__dirname, "src/sdk/lib/server/index.ts"),
    },
  },
  test: {
    include: ["tests/vite/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vite",
      reporter: ["text", "lcov"],
      include: [
        "src/tools/vite/utils.ts",
        "src/tools/vite/async-utils.ts",
        "src/tools/vite/errors.ts",
        "src/tools/vite/logger.ts",
        "src/tools/vite/index.ts",
        "src/tools/vite/node-red-launcher/**/*.ts",
        "src/tools/vite/client/build.ts",
        "src/tools/vite/server/build.ts",
        "src/tools/vite/client/plugins/help-generator.ts",
        "src/tools/vite/client/plugins/help-i18n.ts",
        "src/tools/vite/client/plugins/html-generator.ts",
        "src/tools/vite/client/plugins/locales-generator.ts",
        "src/tools/vite/client/plugins/minifier.ts",
        "src/tools/vite/client/plugins/node-definitions-inliner.ts",
        "src/tools/vite/client/plugins/static-copy.ts",
        "src/tools/vite/server/plugins/output-wrapper.ts",
        "src/tools/vite/server/plugins/package-json-generator.ts",
        "src/tools/vite/server/plugins/type-generator.ts",
        "src/tools/vite/server/plugins/node-type-info.ts",
        "src/tools/vite/server/plugins/node-types-dts.ts",
      ],
    },
  },
});
