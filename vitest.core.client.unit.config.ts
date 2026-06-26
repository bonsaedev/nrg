import { defineConfig } from "vitest/config";
import path from "path";
import { workspaceAliases } from "./vitest.shared";

export default defineConfig({
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
      "@bonsae/nrg/client": path.resolve(
        __dirname,
        "packages/toolkit/src/test/client/unit",
      ),
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  test: {
    testTimeout: 30_000,
    environment: "happy-dom",
    setupFiles: ["tests/core/client/unit/setup.ts"],
    include: ["tests/core/client/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/client-unit",
      reporter: ["text", "lcov"],
      include: [
        "packages/toolkit/src/core/client/validation.ts",
        "packages/toolkit/src/core/client/registration.ts",
        "packages/toolkit/src/core/client/state.ts",
        "packages/toolkit/src/core/client/labels.ts",
        "packages/toolkit/src/core/client/form/index.ts",
      ],
    },
  },
});
