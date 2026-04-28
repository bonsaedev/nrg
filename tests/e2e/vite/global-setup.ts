import path from "path";
import { setupFixtureNodeModules, cleanFixtureNodeModules } from "./setup-fixture";

const FIXTURES = [
  path.resolve(__dirname, "../../fixtures/basic-node"),
  path.resolve(__dirname, "../../fixtures/custom-client"),
];

export function setup() {
  for (const fixture of FIXTURES) {
    setupFixtureNodeModules(fixture);
  }
}

export function teardown() {
  for (const fixture of FIXTURES) {
    cleanFixtureNodeModules(fixture);
  }
}
