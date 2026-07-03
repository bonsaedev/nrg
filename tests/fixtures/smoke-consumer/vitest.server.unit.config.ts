import { defineConfig, mergeConfig } from "vitest/config";
import { defaultConfig } from "@bonsae/nrg/test/server/unit/config";

// The published server-unit defaultConfig (from the packed toolkit) merged with
// this project's include glob — mirrors what a scaffolded consumer ships.
export default mergeConfig(
  defaultConfig,
  defineConfig({
    test: {
      include: ["tests/server/**/*.test.ts"],
    },
  }),
);
