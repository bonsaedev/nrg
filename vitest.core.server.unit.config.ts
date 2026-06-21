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
