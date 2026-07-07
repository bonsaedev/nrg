import path from "node:path";

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
    // unit tests live under tests/server/unit; integration tests live under
    // tests/server/integration and run via their own config — the two tiers are
    // separated by folder, so no exclude is needed
    include: ["tests/server/unit/**/*.test.ts"],
  },
};
