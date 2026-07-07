import path from "node:path";

export const nrg = {
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
      // More specific first: `@/schemas/*` → the consumer's shared schemas.
      "@/schemas": path.resolve(process.cwd(), "src/shared/schemas"),
      "@": path.resolve(process.cwd(), "src"),
      "@bonsae/nrg/client": "@bonsae/nrg/test/client/unit",
    },
  },
  server: {
    fs: {
      allow: [".."],
    },
  },
  test: {
    testTimeout: 30_000,
    environment: "happy-dom" as const,
    setupFiles: ["@bonsae/nrg/test/client/unit/setup"],
    include: ["tests/client/unit/**/*.test.ts"],
  },
};
