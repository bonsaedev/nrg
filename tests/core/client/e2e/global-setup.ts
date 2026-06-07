import path from "path";
import { NodeRedTestEnvironment } from "@/test/client/e2e";
import {
  setupFixtureNodeModules,
  cleanFixtureNodeModules,
} from "../../../fixtures/setup";

const FIXTURE_DIR = path.resolve(__dirname, "../../../fixtures/form-components");

let env: NodeRedTestEnvironment;

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

  await env.deployFlow([
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
  ]);
}

export async function teardown() {
  await env?.teardown();
  cleanFixtureNodeModules(FIXTURE_DIR);
}
