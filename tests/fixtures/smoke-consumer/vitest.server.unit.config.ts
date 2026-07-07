import { defineConfig, mergeConfig } from "vitest/config";
import { nrg } from "@bonsae/nrg/test/server/unit/config";

// The published server-unit `nrg` config (from the packed toolkit) merged with
// this project's include glob — mirrors what a scaffolded consumer ships.
export default mergeConfig(
  nrg,
  defineConfig({
    test: {
      include: ["tests/server/**/*.test.ts"],
    },
  }),
);
