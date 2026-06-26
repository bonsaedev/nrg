// Default vitest config for a consumer's client e2e tests. The e2e global setup
// boots a real Node-RED instance that Playwright drives. Use it directly:
// `export default defineConfig(defaultConfig)`.
export const defaultConfig = {
  test: {
    testTimeout: 60_000,
    hookTimeout: 120_000,
    globalSetup: ["@bonsae/nrg/test/client/e2e"],
    include: ["tests/client/e2e/**/*.test.ts"],
  },
};
