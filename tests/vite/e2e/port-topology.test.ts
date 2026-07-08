import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { build } from "../../../src/tools/vite/server/build";
import { nodeDefsPath } from "../../../src/tools/vite/utils";
import type { ServerBuildOptions } from "../../../src/tools/vite/types";

// End-to-end proof that a node's PORT TOPOLOGY comes from its `Input`/`Output`
// generics — never a schema. The build extracts the generics, derives the
// `__nrgPorts` descriptor, and the injector stamps it onto the built class; the
// runtime routes and the editor draws ports from THAT. Named `Port<T>` keys stamp
// named ports; a tuple stamps positional ports; a node with NO Input/Output
// generics defaults both to `any`, and any/unknown each make ONE untyped port
// (only `never`/`void`/`undefined` suppress a port), so it is 1-in/1-out. There
// is no schema fallback either way.

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

  it("stamps __nrgPorts on the built bundle from a named-Port Output generic", () => {
    // The injector stamps `Object.defineProperty(<Class>, Symbol.for("nrg.ports"),
    // { value: <topology>, … })` on every typed node. Classes are minified to a
    // single letter, so collect EVERY stamp (its keys are quoted → valid JSON) and
    // assert port-node's named topology is among them.
    const stamps = [
      ...bundle.matchAll(
        /Symbol\.for\("nrg\.ports"\),\s*\{\s*value:\s*(\{[\s\S]*?\})\s*,/g,
      ),
    ].map((m) => JSON.parse(m[1]));
    expect(stamps).toContainEqual({
      inputs: 1,
      outputs: 2,
      outputNames: ["ok", "err"],
    });
  });

  it("node-defs derives the port topology from the generic (no output schema field)", () => {
    expect(defs["port-node"].inputs).toBe(1);
    expect(defs["port-node"].outputs).toBe(2);
    expect(defs["port-node"].outputPortNames).toEqual(["ok", "err"]);
    // Topology is purely from the type — the extractor emits no output-schema field.
    expect(defs["port-node"].outputsSchema).toBeUndefined();
  });

  it("stamps positional ports from a tuple Output generic (no names)", () => {
    // second-node: `type Output = [unknown, unknown]` → two positional ports with
    // no names. The descriptor carries the count but omits outputNames.
    expect(defs["second-node"].inputs).toBe(1);
    expect(defs["second-node"].outputs).toBe(2);
    expect(defs["second-node"].outputPortNames).toBeUndefined();
  });

  it("defaults missing Input/Output generics to `any` → 1-in/1-out (no schema fallback)", () => {
    // test-node: `extends IONode<Config, Credentials>` with no Input/Output types →
    // both default to `any`, and any/unknown each make ONE untyped port (only
    // `never` suppresses one), so the node is 1-in/1-out with a single positional
    // output (no names). Proves topology comes ONLY from generics — including their
    // `any` defaults — and never from a schema.
    expect(defs["test-node"].inputs).toBe(1);
    expect(defs["test-node"].outputs).toBe(1);
    expect(defs["test-node"].outputPortNames).toBeUndefined();
  });
});
