import { defineConfig } from "vitest/config";
import path from "path";
import { nrg } from "./src/sdk/test/client/e2e/config";

export default defineConfig({
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
    },
  },
  test: {
    ...nrg.test,
    include: ["tests/sdk/client/e2e/**/*.test.ts"],
    globalSetup: ["tests/sdk/client/e2e/global-setup.ts"],
  },
});
