import path from "path";

export const defaultConfig = {
  resolve: {
    alias: {
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
