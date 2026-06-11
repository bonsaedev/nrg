import path from "path";
import { NodeRedTestEnvironment } from "@/test/client/e2e";
import {
  setupFixtureNodeModules,
  cleanFixtureNodeModules,
} from "../../../fixtures/setup";

const FIXTURE_DIR = path.resolve(
  __dirname,
  "../../../fixtures/form-components",
);

let env: NodeRedTestEnvironment;

/** Deployed by setup() and re-deployed by tests that need to restore state. */
export const FIXTURE_FLOW: Record<string, unknown>[] = [
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
    errorPort: false,
    x: 250,
    y: 200,
    wires: [[]],
  },
  {
    id: "n2",
    type: "custom-form-node",
    z: "tab1",
    name: "",
    sobject: { value: "", type: "sobject" },
    x: 250,
    y: 300,
    wires: [[]],
  },
  {
    id: "cfg1",
    type: "test-config",
    name: "Test Server",
    host: "localhost",
    port: 8080,
  },
];

export async function setup() {
  setupFixtureNodeModules(FIXTURE_DIR);

  env = new NodeRedTestEnvironment({
    projectDir: FIXTURE_DIR,
    packageName: "form-components",
    clientName: "FormComponentsNodes",
    port: 1881,
    settingsFile: "node-red.settings.ts",
  });

  const port = await env.setup();
  process.env.NODE_RED_PORT = String(port);

  await env.deployFlow(FIXTURE_FLOW);
}

export async function teardown() {
  await env?.teardown();
  cleanFixtureNodeModules(FIXTURE_DIR);
}
