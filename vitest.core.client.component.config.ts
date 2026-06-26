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
      "@/core": path.resolve(__dirname, "src/core"),
      "@/vite": path.resolve(__dirname, "src/vite"),
      "@/test": path.resolve(__dirname, "src/test"),
      "@bonsae/nrg-runtime/server": path.resolve(
        __dirname,
        "src/core/server/index.ts",
      ),
      "@bonsae/nrg/server": path.resolve(__dirname, "src/core/server/index.ts"),
      "@mocks": path.resolve(__dirname, "tests/core/client/mocks"),
      "@bonsae/nrg/client": path.resolve(
        __dirname,
        "src/test/client/component",
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
    // Serializes a fixture node registry in Node and provides it to the browser
    // tests as data — exercises the shipped schemas globalSetup end-to-end so
    // createNode({ type }) can resolve a real schema without a server import.
    globalSetup: ["tests/core/client/component/fixtures/provide-schemas.ts"],
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
        "src/core/client/**/*.{ts,vue}",
        "src/core/constants.ts",
        "src/test/client/mocks/**/*.ts",
        "src/test/client/install-mocks.ts",
        "src/test/client/component/index.ts",
        "src/test/client/component/setup.ts",
      ],
      exclude: ["**/types.ts", "**/*.d.ts"],
    },
  },
});
