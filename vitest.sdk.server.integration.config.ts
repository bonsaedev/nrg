import { defineConfig } from "vitest/config";
import path from "path";

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
      // the integration lib imports the package entry so it binds to the host's
      // nrg copy; in-repo, that's the source server barrel (same identity as the
      // test nodes, so registerType's instanceof check passes)
      "@bonsae/nrg/server": path.resolve(__dirname, "src/sdk/lib/server/index.ts"),
    },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    fileParallelism: false,
    include: ["tests/sdk/server/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/server-integration",
      reporter: ["text", "lcov"],
      // the integration tier owns the integration harness; server runtime code is
      // measured by the server unit tier
      include: ["src/sdk/test/server/integration/**/*.ts"],
      exclude: [
        "src/sdk/test/server/integration/config.ts",
        "**/types/**",
        "**/types.ts",
        "**/*.d.ts",
      ],
    },
  },
});
