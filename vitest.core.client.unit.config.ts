import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "packages/runtime/src"),
      "@/vite": path.resolve(__dirname, "packages/toolkit/src/vite"),
      "@/test": path.resolve(__dirname, "packages/toolkit/src/test"),
      "@bonsae/nrg-runtime/internal/client": path.resolve(__dirname, "packages/runtime/src/internal-client.ts"),
      "@bonsae/nrg-runtime/internal/components": path.resolve(__dirname, "packages/runtime/src/internal-components.ts"),
      "@bonsae/nrg-runtime/internal": path.resolve(__dirname, "packages/runtime/src/internal.ts"),
      "@bonsae/nrg-runtime/server": path.resolve(__dirname, "packages/runtime/src/server/index.ts"),
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
      "@bonsae/nrg/client": path.resolve(__dirname, "packages/toolkit/src/test/client/unit"),
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
        "packages/runtime/src/client/validation.ts",
        "packages/runtime/src/client/registration.ts",
        "packages/runtime/src/client/state.ts",
        "packages/runtime/src/client/labels.ts",
        "packages/runtime/src/client/form/index.ts",
      ],
    },
  },
});
