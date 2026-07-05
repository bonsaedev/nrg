import fs from "fs";
import path from "path";
import { NodeRedTestEnvironment } from "@/sdk/test/client/e2e";
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
    id: "n3",
    type: "basic-node",
    z: "tab1",
    name: "Greeter",
    errorPort: true,
    completePort: true,
    statusPort: false,
    outputs: 3, // 1 base + error + complete (keeps the canvas in sync)
    x: 250,
    y: 380,
    wires: [[], [], []],
  },
  {
    id: "n4",
    type: "ctx-modes-node",
    z: "tab1",
    name: "",
    outputs: 3,
    x: 250,
    y: 460,
    wires: [[], [], []],
  },
  {
    id: "n5",
    type: "output-schema-node",
    z: "tab1",
    name: "",
    outputs: 2,
    x: 250,
    y: 540,
    wires: [[], []],
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

  // The launched runtime (a copy of the BUILT @bonsae/nrg-runtime) serves the
  // editor client under its content-hashed name (nrg.<hash>.js). Here the client
  // fixture is built with the un-injected SOURCE vite plugin, so hand it the
  // exact hashed name the runtime will serve — otherwise the rewritten
  // `@bonsae/nrg/client` URL 404s and the editor forms never load.
  const runtimeResDir = path.join(
    FIXTURE_DIR,
    "node_modules/@bonsae/nrg-runtime/resources",
  );
  const clientAsset = fs
    .readdirSync(runtimeResDir)
    .find((f) => /^nrg\.[0-9a-f]+\.js$/.test(f));
  // Fail loudly rather than fall back to the un-hashed dev name — a missing
  // hashed asset means the runtime build is missing/stale, and a silent
  // fallback would 404 every form and reproduce an inscrutable e2e timeout.
  if (!clientAsset) {
    throw new Error(
      `No hashed client asset (nrg.<hash>.js) found in ${runtimeResDir} — ` +
        "the @bonsae/nrg-runtime build is missing or stale; run `pnpm build` first.",
    );
  }
  process.env.NRG_CLIENT_ASSET = clientAsset;

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
