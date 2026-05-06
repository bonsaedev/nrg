import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@bonsae/nrg/server": path.resolve(
        __dirname,
        "src/core/server/index.ts",
      ),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/core/server/**/*.ts",
        "src/core/validator.ts",
        "src/core/errors.ts",
        "src/vite/utils.ts",
        "src/vite/async-utils.ts",
        "src/vite/errors.ts",
        "src/vite/client/plugins/help-generator.ts",
        "src/vite/client/plugins/help-i18n.ts",
      ],
      exclude: ["src/**/types/**", "src/**/types.ts"],
    },
  },
});
