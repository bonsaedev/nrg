import path from "path";
import {
  setup as baseSetup,
  teardown as baseTeardown,
} from "../../../../src/test/client/e2e";
import {
  setupFixtureNodeModules,
  cleanFixtureNodeModules,
} from "../../../fixtures/setup";

const FIXTURE_DIR = path.resolve(__dirname, "../../../fixtures/form-components");

export async function setup() {
  setupFixtureNodeModules(FIXTURE_DIR);
  await baseSetup({
    projectDir: FIXTURE_DIR,
    packageName: "form-components",
    clientName: "FormComponentsNodes",
    port: 1881,
    settingsFile: "node-red.settings.ts",
    flow: [
      { id: "tab1", type: "tab", label: "E2E Tests" },
      {
        id: "n1",
        type: "all-fields-node",
        z: "tab1",
        name: "",
        count: 0,
        rate: 1.5,
        enabled: true,
        active: false,
        color: "red",
        target: { value: "payload", type: "msg" },
        source: { value: "", type: "str" },
        tags: [],
        recipients: [],
        template: "<p>Hello</p>",
        server: "",
        x: 250,
        y: 200,
        wires: [[]],
      },
      {
        id: "cfg1",
        type: "test-config",
        name: "Test Server",
        host: "localhost",
        port: 8080,
      },
    ],
  });
}

export async function teardown() {
  await baseTeardown();
  cleanFixtureNodeModules(FIXTURE_DIR);
}
