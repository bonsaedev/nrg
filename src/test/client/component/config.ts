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
    // @bonsae/nrg/server is a CJS bundle — prebundling converts it so browser
    // tests can import TypeBox schemas straight from server schema modules.
    include: [
      "@bonsae/nrg/server",
      "jsonpointer",
      "ajv",
      "ajv-formats",
      "ajv-errors",
    ],
  },
  test: {
    testTimeout: 30_000,
    setupFiles: ["@bonsae/nrg/test/client/component/setup"],
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
