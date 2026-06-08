import { defineConfig, mergeConfig } from "vitest/config";
import path from "path";
import { defaultConfig } from "./src/test/server/unit/config";

export default mergeConfig(defaultConfig, defineConfig({
  resolve: {
    alias: {
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
      reportsDirectory: "coverage/server",
      reporter: ["text", "lcov"],
      include: [
        "src/core/server/**/*.ts",
        "src/core/validator.ts",
        "src/core/errors.ts",
      ],
      exclude: ["src/**/types/**", "src/**/types.ts"],
    },
  },
}));
