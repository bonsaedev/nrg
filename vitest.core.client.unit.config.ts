import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
      "@/core": path.resolve(__dirname, "src/core"),
      "@/vite": path.resolve(__dirname, "src/vite"),
      "@/test": path.resolve(__dirname, "src/test"),
      "@bonsae/nrg-runtime": path.resolve(
        __dirname,
        "src/core/runtime.ts",
      ),
      "@bonsae/nrg/server": path.resolve(__dirname, "src/core/server/index.ts"),
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
      "@bonsae/nrg/client": path.resolve(__dirname, "src/test/client/unit"),
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
        "src/core/client/validation.ts",
        "src/core/client/registration.ts",
        "src/core/client/state.ts",
        "src/core/client/labels.ts",
        "src/core/client/form/index.ts",
      ],
    },
  },
});
