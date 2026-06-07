export type { MockRED, MockEditor } from "../mocks";
export { createRED, createJQuery } from "../mocks";

export const defaultConfig = {
  testTimeout: 30_000,
  environment: "happy-dom" as const,
  setupFiles: ["@bonsae/nrg/test/client/unit/setup"],
};
