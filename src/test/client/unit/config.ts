import path from "path";

export const defaultConfig = {
  esbuild: {
    tsconfigRaw: "{}",
  },
  resolve: {
    alias: {
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
  },
};
