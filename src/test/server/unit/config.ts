import path from "path";

export const defaultConfig = {
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    testTimeout: 30_000,
  },
};
