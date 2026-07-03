import { defineConfig } from "vitest/config";
import path from "path";

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
      // the integration lib imports the package entry so it binds to the host's
      // nrg copy; in-repo, that's the source server barrel (same identity as the
      // test nodes, so registerType's instanceof check passes)
      "@bonsae/nrg/server": path.resolve(__dirname, "src/core/server/index.ts"),
    },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks",
    fileParallelism: false,
    include: ["tests/core/server/integration/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/server-integration",
      reporter: ["text", "lcov"],
      // the integration tier owns the integration harness; core server code is
      // measured by the server unit tier
      include: ["src/test/server/integration/**/*.ts"],
      exclude: [
        "src/test/server/integration/config.ts",
        "**/types/**",
        "**/types.ts",
        "**/*.d.ts",
      ],
    },
  },
});
