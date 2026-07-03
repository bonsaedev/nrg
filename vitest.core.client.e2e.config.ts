import { defineConfig } from "vitest/config";
import path from "path";
import { defaultConfig } from "./src/test/client/e2e/config";

export default defineConfig({
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
    },
  },
  test: {
    ...defaultConfig.test,
    include: ["tests/core/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/core/client/e2e/global-setup.ts"],
  },
});
