import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { extractNodeDefinitions } from "@/tools/vite/server/plugins/node-defs-extractor";
import { nodeDefsPath, clientCacheDir } from "@/tools/vite/utils";

describe("extractNodeDefinitions", () => {
  let outDir: string;

  beforeEach(() => {
    outDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-extractor-"));
  });

  afterEach(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(clientCacheDir(outDir), { recursive: true, force: true });
  });

  // A stand-in for the built server bundle: default-exports { nodes } with the
  // statics the extractor reads. Plain object props stand in for class statics.
  function writeBundle(nodes: unknown[]): void {
    fs.writeFileSync(
      path.join(outDir, "index.mjs"),
      `export default ${JSON.stringify({ nodes })};`,
    );
  }

  it("writes node statics, schema-derived defaults and credentials to the hand-off JSON", async () => {
    writeBundle([
      {
        type: "test-node",
        category: "function",
        color: "#abcabc",
        configSchema: {
          properties: {
            name: { default: "hi" },
            ref: { default: "", "x-nrg-node-type": "cfg" },
          },
        },
        credentialsSchema: {
          properties: { apiKey: { default: "", format: "password" } },
        },
        inputSchema: { properties: {} },
        outputsSchema: [{}, {}],
        inputs: 1,
        outputs: 2,
        outputPortNames: ["ok", "err"],
      },
    ]);

    await extractNodeDefinitions(outDir);

    const written = JSON.parse(fs.readFileSync(nodeDefsPath(outDir), "utf-8"));
    expect(written.nodeTypes).toEqual(["test-node"]);

    const def = written.definitions["test-node"];
    expect(def.category).toBe("function");
    expect(def.color).toBe("#abcabc");
    expect(def.outputPortNames).toEqual(["ok", "err"]);
    // The icon is a client concern — the server extractor must not set it.
    expect(def.icon).toBeUndefined();

    // Defaults derive from the config schema, plus the validate* flags injected
    // when input/outputs schemas are present.
    expect(def.defaults.name).toEqual({
      required: false,
      value: "hi",
      type: undefined,
    });
    expect(def.defaults.ref.type).toBe("cfg");
    expect(def.defaults.validateInput).toEqual({
      required: false,
      value: false,
    });
    expect(def.defaults.validateOutputs).toEqual({
      required: false,
      value: {},
    });

    // Password credential fields map to type "password".
    expect(def.credentials.apiKey).toEqual({
      required: false,
      type: "password",
      value: "",
    });
  });

  it("skips node classes without a type and writes an empty set for no nodes", async () => {
    writeBundle([{ category: "function" }]); // no `type`
    await extractNodeDefinitions(outDir);
    const written = JSON.parse(fs.readFileSync(nodeDefsPath(outDir), "utf-8"));
    expect(written).toEqual({ nodeTypes: [], definitions: {} });
  });

  const FRAMEWORK_KEYS = [
    "name",
    "errorPort",
    "completePort",
    "statusPort",
    "outputReturnProperties",
    "outputContextModes",
  ];

  it("injects the framework config fields into an IONode that declares none of them", async () => {
    // An IONode is detected by the numeric `outputs` getter. This node declares
    // only `query` — no lifecycle ports, no return/context config.
    writeBundle([
      {
        type: "io-node",
        category: "function",
        configSchema: {
          $id: "io-node:config",
          properties: { query: { default: "" } },
        },
        inputs: 1,
        outputs: 1,
      },
    ]);

    await extractNodeDefinitions(outDir);
    const written = JSON.parse(fs.readFileSync(nodeDefsPath(outDir), "utf-8"));
    const def = written.definitions["io-node"];

    // The author field survives, and every framework field is now present in
    // both the emitted schema and the editor defaults — with no declaration.
    expect(Object.keys(def.configSchema.properties)).toContain("query");
    for (const key of FRAMEWORK_KEYS) {
      expect(Object.keys(def.configSchema.properties)).toContain(key);
      expect(def.defaults[key]).toBeDefined();
    }
    // Lifecycle ports default OFF.
    expect(def.defaults.errorPort.value).toBe(false);
  });

  it("does NOT inject the framework port fields into a config node (no ports)", async () => {
    // A config node has no `outputs` getter, so it must be left untouched.
    writeBundle([
      {
        type: "cfg-node",
        category: "config",
        configSchema: {
          $id: "cfg-node:config",
          properties: { host: { default: "" } },
        },
        // no `inputs`/`outputs`
      },
    ]);

    await extractNodeDefinitions(outDir);
    const written = JSON.parse(fs.readFileSync(nodeDefsPath(outDir), "utf-8"));
    const def = written.definitions["cfg-node"];

    expect(Object.keys(def.configSchema.properties)).toEqual(["host"]);
    for (const key of ["errorPort", "completePort", "statusPort"]) {
      expect(def.configSchema.properties[key]).toBeUndefined();
    }
  });
});
