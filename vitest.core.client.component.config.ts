import { defineConfig } from "vitest/config";
import path from "path";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [vue()],
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
      "@bonsae/nrg/client": path.resolve(
        __dirname,
        "packages/toolkit/src/test/client/component",
      ),
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  optimizeDeps: {
    include: ["jsonpointer", "ajv", "ajv-formats", "ajv-errors"],
  },
  test: {
    testTimeout: 30_000,
    setupFiles: ["tests/core/client/component/setup.ts"],
    include: ["tests/core/client/component/**/*.test.ts"],
    browser: {
      enabled: true,
      instances: [
        { browser: "chromium" },
        { browser: "firefox" },
        { browser: "webkit" },
      ],
      provider: playwright(),
    },
    coverage: {
      provider: "istanbul",
      reportsDirectory: "coverage/client-component",
      reporter: ["text", "lcov"],
      // Everything the browser-mode tests exercise: the whole client plane
      // plus the shipped component-test utilities and mocks they validate.
      include: [
        "packages/runtime/src/client/**/*.{ts,vue}",
        "packages/runtime/src/constants.ts",
        "packages/toolkit/src/test/client/mocks.ts",
        "packages/toolkit/src/test/client/component/index.ts",
        "packages/toolkit/src/test/client/component/jquery.ts",
        "packages/toolkit/src/test/client/component/setup.ts",
      ],
      exclude: ["**/types.ts", "**/*.d.ts"],
    },
  },
});
