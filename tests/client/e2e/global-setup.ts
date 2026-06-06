/**
 * Global setup for Node-RED E2E browser tests.
 *
 * 1. Copies @bonsae/nrg dist into the fixture's node_modules
 * 2. Builds the fixture (server + client)
 * 3. Starts Node-RED with the built nodes
 * 4. Deploys a test flow
 * 5. Writes the port to a temp file so tests can read it
 */

import fs from "fs";
import os from "os";
import path from "path";
import { build as buildServer } from "../../../src/vite/server/build";
import { build as buildClient } from "../../../src/vite/client/build";
import { NodeRedLauncher } from "../../../src/vite/node-red-launcher";
import {
  setupFixtureNodeModules,
  cleanFixtureNodeModules,
} from "../../e2e/vite/setup-fixture";
import type {
  BuildContext,
  ServerBuildOptions,
  ClientBuildOptions,
} from "../../../src/vite/types";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/form-components");
const OUT_DIR = path.join(FIXTURE_DIR, "dist-e2e-browser");
const NODE_RED_DIR = path.join(FIXTURE_DIR, ".node-red");
const INSTALLED_PKG_DIR = path.join(
  NODE_RED_DIR,
  "node_modules",
  "form-components",
);
export const PORT_FILE = path.join(os.tmpdir(), "nrg-client-e2e-port");

let launcher: NodeRedLauncher;
let originalCwd: string;

export async function setup(): Promise<void> {
  // 1. Link @bonsae/nrg
  setupFixtureNodeModules(FIXTURE_DIR);

  // 2. Build the fixture
  originalCwd = process.cwd();
  process.chdir(FIXTURE_DIR);

  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const buildContext: BuildContext = {
    outDir: OUT_DIR,
    packageName: "form-components",
    isDev: false,
  };

  const serverOpts: ServerBuildOptions = {
    srcDir: path.join(FIXTURE_DIR, "src/server"),
    entry: "index.ts",
    format: "esm",
    bundled: [],
    types: false,
    nodeTarget: "node22",
  };
  await buildServer(serverOpts, buildContext);

  const clientOpts: ClientBuildOptions = {
    srcDir: path.join(FIXTURE_DIR, "src/client"),
    entry: "index.ts",
    name: "FormComponentsNodes",
    format: "es",
    external: ["jquery", "node-red", "vue", "@bonsae/nrg/client"],
    globals: { jquery: "$", "node-red": "RED", vue: "Vue" },
  };
  await buildClient(clientOpts, buildContext);

  // 3. Install built package into Node-RED's node_modules so resources are served
  fs.mkdirSync(INSTALLED_PKG_DIR, { recursive: true });
  fs.cpSync(OUT_DIR, INSTALLED_PKG_DIR, { recursive: true });

  // 4. Pre-create runtime config to suppress the "Enable Update Notifications" dialog
  fs.mkdirSync(NODE_RED_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(NODE_RED_DIR, ".config.runtime.json"),
    JSON.stringify({ telemetryEnabled: false }),
  );

  // 5. Start Node-RED (CWD stays in fixture dir so userDir is scoped there)
  launcher = new NodeRedLauncher(INSTALLED_PKG_DIR, {
    runtime: {
      port: 1881,
      settingsFilepath: path.join(FIXTURE_DIR, "node-red.settings.ts"),
    },
  });
  const port = await launcher.start();
  launcher.flushLogs();

  process.chdir(originalCwd);

  // 4. Deploy a test flow
  const flow = [
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
  ];

  const res = await fetch(`http://localhost:${port}/flows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Node-RED-Deployment-Type": "full",
    },
    body: JSON.stringify(flow),
  });
  if (!res.ok) {
    console.error("Failed to deploy test flow:", await res.text());
  }

  // 5. Store port for tests
  fs.writeFileSync(PORT_FILE, String(port));
}

export async function teardown(): Promise<void> {
  if (launcher) {
    await launcher.stop();
    launcher.cleanup();
  }
  cleanFixtureNodeModules(FIXTURE_DIR);
  if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
  if (fs.existsSync(PORT_FILE)) fs.unlinkSync(PORT_FILE);
  // Clean up .node-red directory created by Node-RED
  const nodeRedDir = path.join(FIXTURE_DIR, ".node-red");
  if (fs.existsSync(nodeRedDir)) fs.rmSync(nodeRedDir, { recursive: true });
}
