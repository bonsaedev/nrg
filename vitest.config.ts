import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "src/core/server/**/*.ts",
        "src/core/validator.ts",
        "src/core/errors.ts",
        "src/vite/utils.ts",
        "src/vite/async-utils.ts",
        "src/vite/errors.ts",
      ],
      exclude: ["src/**/types/**", "src/**/types.ts"],
    },
  },
});
