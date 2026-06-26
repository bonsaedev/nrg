import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "src/core"),
      "@/vite": path.resolve(__dirname, "src/vite"),
      "@/test": path.resolve(__dirname, "src/test"),
      "@bonsae/nrg-runtime/server": path.resolve(
        __dirname,
        "src/core/server/index.ts",
      ),
      "@bonsae/nrg/server": path.resolve(__dirname, "src/core/server/index.ts"),
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
        "src/core/server/**/*.ts",
        "src/core/validator.ts",
        "src/core/errors.ts",
        "src/core/constants.ts",
        "src/test/server/unit/index.ts",
        "src/test/server/unit/mocks.ts",
      ],
      exclude: ["**/types/**", "**/types.ts", "**/*.d.ts"],
    },
  },
});
