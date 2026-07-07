import path from "node:path";

/**
 * Default vitest config for the server integration tier. Node-RED uses
 * module-level singletons, so each test file boots its own runtime in its own
 * forked process and files run one at a time.
 */
export const nrg = {
  resolve: {
    alias: {
      // More specific first: `@/schemas/*` → the consumer's shared schemas.
      "@/schemas": path.resolve(process.cwd(), "src/shared/schemas"),
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: "forks" as const,
    fileParallelism: false,
    // integration tests live under tests/server/integration, separate from the
    // unit tier (tests/server/unit) so the two never overlap
    include: ["tests/server/integration/**/*.test.ts"],
  },
};
