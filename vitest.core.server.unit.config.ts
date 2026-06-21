import { defineConfig } from "vitest/config";
import path from "path";
import { workspaceAliases } from "./vitest.shared";

export default defineConfig({
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
      "@mocks": path.resolve(__dirname, "tests/core/server/mocks"),
    },
  },
  test: {
    testTimeout: 30_000,
    include: [
      "tests/core/server/unit/**/*.test.ts",
      "tests/core/unit/**/*.test.ts",
    ],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/server",
      reporter: ["text", "lcov"],
      include: [
        "packages/runtime/src/server/**/*.ts",
        "packages/runtime/src/validator.ts",
        "packages/runtime/src/errors.ts",
        "packages/runtime/src/constants.ts",
        "packages/toolkit/src/test/server/unit/index.ts",
        "packages/toolkit/src/test/server/unit/mocks.ts",
      ],
      exclude: ["**/types/**", "**/types.ts", "**/*.d.ts"],
    },
  },
});
