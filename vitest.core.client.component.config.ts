import { defineConfig } from "vitest/config";
import path from "path";
import { workspaceAliases } from "./vitest.shared";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  plugins: [vue()],
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
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
        "packages/toolkit/src/core/client/**/*.{ts,vue}",
        "packages/toolkit/src/core/constants.ts",
        "packages/toolkit/src/test/client/mocks/**/*.ts",
        "packages/toolkit/src/test/client/install-mocks.ts",
        "packages/toolkit/src/test/client/component/index.ts",
        "packages/toolkit/src/test/client/component/setup.ts",
      ],
      exclude: ["**/types.ts", "**/*.d.ts"],
    },
  },
});
