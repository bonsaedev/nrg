import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  esbuild: {
    tsconfigRaw: "{}",
  },
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
      "@mocks": path.resolve(__dirname, "tests/sdk/client/mocks"),
      "@bonsae/nrg/client": path.resolve(__dirname, "src/sdk/test/client/unit"),
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
    setupFiles: ["tests/sdk/client/unit/setup.ts"],
    include: ["tests/sdk/client/unit/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/client-unit",
      reporter: ["text", "lcov"],
      include: [
        "src/sdk/lib/client/validation.ts",
        "src/sdk/lib/client/registration.ts",
        "src/sdk/lib/client/state.ts",
        "src/sdk/lib/client/labels.ts",
        "src/sdk/lib/client/form/index.ts",
      ],
    },
  },
});
