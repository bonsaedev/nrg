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
        "src/sdk/lib/server/**/*.ts",
        "src/sdk/lib/validator.ts",
        "src/sdk/lib/errors.ts",
        "src/sdk/lib/constants.ts",
        "src/sdk/test/server/unit/index.ts",
        "src/sdk/test/server/unit/mocks.ts",
      ],
      exclude: ["**/types/**", "**/types.ts", "**/*.d.ts"],
    },
  },
});
