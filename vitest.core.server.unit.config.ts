import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@mocks": path.resolve(__dirname, "tests/core/server/mocks"),
    },
  },
  test: {
    include: [
      "tests/core/server/unit/**/*.test.ts",
      "tests/core/unit/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/core/server/**/*.ts",
        "src/core/validator.ts",
        "src/core/errors.ts",
      ],
      exclude: ["src/**/types/**", "src/**/types.ts"],
    },
  },
});
