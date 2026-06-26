import path from "path";
import vue from "@vitejs/plugin-vue";
import { playwright } from "@vitest/browser-playwright";

export const defaultConfig = {
  plugins: [vue()],
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
      "@bonsae/nrg/client": "@bonsae/nrg/test/client/component",
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  optimizeDeps: {
    // Validator deps used by the form harness in the browser. Note: the server
    // bundle is deliberately NOT prebundled — browser/client code must never
    // value-import the node runtime. Schemas reach component tests as data via
    // the `schemas` globalSetup below (createNode resolves them by node type).
    include: ["jsonpointer", "ajv", "ajv-formats", "ajv-errors"],
  },
  test: {
    testTimeout: 30_000,
    setupFiles: ["@bonsae/nrg/test/client/component/setup"],
    // Serializes the package's node schemas (from src/server) in Node and
    // provides them to the browser tests as data — mirrors the vite plugin, so
    // tests never pull the server runtime into the browser bundle.
    globalSetup: ["@bonsae/nrg/test/client/component/schemas"],
    include: ["tests/client/component/**/*.test.ts"],
    browser: {
      enabled: true,
      instances: [
        { browser: "chromium" },
        { browser: "firefox" },
        { browser: "webkit" },
      ],
      provider: playwright(),
    },
  },
};
