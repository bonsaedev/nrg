import { defineConfig } from "vitest/config";
import path from "path";
import { workspaceAliases } from "./vitest.shared";

export default defineConfig({
  resolve: {
    alias: {
      ...workspaceAliases(__dirname),
      // the integration lib imports the package entry so it binds to the host's
      // nrg copy; in-repo, that's the source server barrel (same identity as the
      // test nodes, so registerType's instanceof check passes)
      "@bonsae/nrg/server": path.resolve(
        __dirname,
        "packages/toolkit/src/core/server/index.ts",
      ),
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
      include: ["packages/toolkit/src/test/server/integration/**/*.ts"],
      exclude: [
        "packages/toolkit/src/test/server/integration/config.ts",
        "**/types/**",
        "**/types.ts",
        "**/*.d.ts",
      ],
    },
  },
});
