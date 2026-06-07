export type { MockRED, MockEditor } from "../mocks";
export { createRED, createJQuery } from "../mocks";

export const defaultConfig = {
  testTimeout: 30_000,
  setupFiles: ["@bonsae/nrg/test/client/unit/setup"],
  browser: {
    enabled: true,
    instances: [{ browser: "chromium" }],
  },
};
