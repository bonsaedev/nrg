import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/vite/e2e/**/*.test.ts"],
    globalSetup: ["tests/vite/e2e/global-setup.ts"],
    testTimeout: 30000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/vite-e2e",
      reporter: ["text", "lcov"],
      // The e2e suite runs the real builds in-process — it is the only suite
      // exercising the build pipelines and the definitions inliner.
      include: [
        "src/tools/vite/index.ts",
        "src/tools/vite/client/build.ts",
        "src/tools/vite/server/build.ts",
        "src/tools/vite/client/plugins/**/*.ts",
        "src/tools/vite/server/plugins/**/*.ts",
      ],
      exclude: ["**/types.ts", "**/*.d.ts"],
    },
  },
});
