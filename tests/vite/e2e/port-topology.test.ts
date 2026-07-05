import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { build } from "../../../src/tools/vite/server/build";
import { nodeDefsPath } from "../../../src/tools/vite/utils";
import type { ServerBuildOptions } from "../../../src/tools/vite/types";

// End-to-end proof that a node's PORT TOPOLOGY comes from its `Input`/`Output`
// generics — no `outputsSchema`. The build extracts the generics, derives the
// `__nrgPorts` descriptor, and the injector stamps it onto the built class; the
// runtime routes and the editor draws ports from THAT. A legacy schema-only node
// (no generics) is left untouched and keeps computing topology from its schema.

const BASIC = path.resolve(__dirname, "../../fixtures/basic-node");

describe("port topology injection (schema-free Port outputs)", () => {
  let outDir: string;
  let bundle: string;
  let defs: Record<string, any>;

  beforeAll(async () => {
    outDir = path.join(BASIC, "dist-port-topo");
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    const cwd = process.cwd();
    process.chdir(BASIC);
    try {
      const opts: ServerBuildOptions = {
        srcDir: path.join(BASIC, "src/server"),
        entry: "index.ts",
        format: "esm",
        bundled: [],
        types: true,
        nodeTarget: "node22",
      };
      await build(opts, {
        outDir,
        packageName: "node-red-test-basic",
        isDev: false,
        resourcesDir: path.join(BASIC, "src/resources"),
      });
      // Read while still chdir'd into the fixture: nodeDefsPath resolves the
      // client cache dir relative to cwd, and the build wrote it under BASIC.
      bundle = fs.readFileSync(path.join(outDir, "index.mjs"), "utf-8");
      defs = JSON.parse(
        fs.readFileSync(nodeDefsPath(outDir), "utf-8"),
      ).definitions;
    } finally {
      process.chdir(cwd);
    }
  }, 120000);

  afterAll(() => {
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
  });

  it("stamps __nrgPorts on the built bundle from the Output generic", () => {
    // rollup may re-space the injected object literal, so parse it (its keys are
    // quoted → valid JSON) and compare structurally.
    const m = bundle.match(/__nrgPorts\s*=\s*(\{[\s\S]*?\})\s*;/);
    expect(m).toBeTruthy();
    expect(JSON.parse(m![1])).toEqual({
      inputs: 1,
      outputs: 2,
      outputNames: ["ok", "err"],
    });
  });

  it("node-defs derives the port topology from the generic (no outputsSchema)", () => {
    expect(defs["port-node"].inputs).toBe(1);
    expect(defs["port-node"].outputs).toBe(2);
    expect(defs["port-node"].outputPortNames).toEqual(["ok", "err"]);
    // it declares NO output schema — topology is purely from the type.
    expect(defs["port-node"].outputsSchema).toBeNull();
  });

  it("a schema-only node (no generics) is NOT injected and keeps its schema topology", () => {
    // router-node: bare `extends IONode` + outputsSchema { success, failure } →
    // no typed generics → portTopology is undefined → not injected → the runtime
    // getter falls back to the schema. Proves generic-injection and the schema
    // fallback coexist in one build.
    expect(defs["router-node"].outputs).toBe(2);
    expect(defs["router-node"].outputPortNames).toEqual(["success", "failure"]);
    // router-node declares its ports via schema, not generics:
    expect(defs["router-node"].outputsSchema).not.toBeNull();
  });
});
