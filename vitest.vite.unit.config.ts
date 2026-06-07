import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/vite/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vite",
      reporter: ["text", "lcov"],
      include: [
        "src/vite/utils.ts",
        "src/vite/async-utils.ts",
        "src/vite/errors.ts",
        "src/vite/logger.ts",
        "src/vite/client/plugins/help-generator.ts",
        "src/vite/client/plugins/help-i18n.ts",
        "src/vite/client/plugins/html-generator.ts",
        "src/vite/client/plugins/locales-generator.ts",
        "src/vite/client/plugins/minifier.ts",
        "src/vite/client/plugins/static-copy.ts",
        "src/vite/server/plugins/output-wrapper.ts",
        "src/vite/server/plugins/package-json-generator.ts",
        "src/vite/server/plugins/type-generator.ts",
      ],
    },
  },
});
