import { describe, it, expect, afterAll, vi } from "vitest";

// Each case runs a real `tsc` compile; under CI's --coverage (v8 instrumentation)
// each compile is several-fold slower and can exceed vitest's default 5s timeout.
// Widen it so coverage-slowed compiles aren't reported as false timeouts.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import fs from "fs";
import path from "path";
import os from "os";
import ts from "typescript";
import {
  extractNodeTypes,
  portTopology,
  type NodeTypeInfo,
} from "@/tools/vite/server/plugins/node-type-info";

// The extractor reads a node's TypeScript types via a real TypeChecker — the
// source of truth for docs, since schemas are optional. Here we resolve
// `@bonsae/nrg/server` to the repo's own source so IONode/ConfigNode generics
// are real, then assert the recovered Config/Input/Output/complete types.

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-type-info-"));

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
function extract(source: string): NodeTypeInfo[] {
  const dir = path.join(TMP, `case-${counter++}`);
  fs.mkdirSync(path.join(dir, "nodes"), { recursive: true });
  const file = path.join(dir, "nodes", "the-node.ts");
  fs.writeFileSync(file, source);
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: REPO,
      paths: {
        "@bonsae/nrg/server": ["src/sdk/lib/server/index.ts"],
        "@bonsae/nrg/schema": ["src/sdk/lib/shared/schemas/index.ts"],
      },
    },
  });
  return extractNodeTypes(program, dir);
}

function field(info: NodeTypeInfo, role: keyof NodeTypeInfo, name: string) {
  const r = info[role] as {
    fields: { name: string; type: string; optional: boolean }[];
  };
  return r.fields.find((f) => f.name === name);
}

function portField(info: NodeTypeInfo, portIndex: number, name: string) {
  return info.outputs?.[portIndex]?.role.fields.find((f) => f.name === name);
}

describe("extractNodeTypes — class API", () => {
  it("recovers Config/Input/Output roles from IONode generics", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { name: string; threshold: number; verbose?: boolean };
      type Input = { payload: string };
      type Output = { result: string };
      export default class MyNode extends IONode<Config, never, Input, Output> {
        static readonly type = "my-node";
        async input(msg: Input) {
          return { done: true, count: 1 };
        }
      }
    `);

    expect(node.type).toBe("my-node");
    expect(node.kind).toBe("io");

    expect(field(node, "config", "name")?.type).toBe("string");
    expect(field(node, "config", "threshold")?.type).toBe("number");
    expect(field(node, "config", "verbose")?.optional).toBe(true);

    expect(field(node, "input", "payload")?.type).toBe("string");
    // single object output → one port
    expect(node.outputs).toHaveLength(1);
    expect(portField(node, 0, "result")?.type).toBe("string");

    // credentials was `never` → carries nothing → omitted
    expect(node.credentials).toBeUndefined();
  });

  it("derives the complete port type from input()'s return type", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ x: number }> {
        static readonly type = "my-node";
        async input() {
          return { done: true, count: 1 };
        }
      }
    `);
    expect(field(node, "complete", "done")?.type).toBe("boolean");
    expect(field(node, "complete", "count")?.type).toBe("number");
  });

  it("renders a union of string literals verbatim (the delimiter case)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { delimiter: "COMMA" | "TAB" | "PIPE" };
      export default class MyNode extends IONode<Config> {
        static readonly type = "my-node";
      }
    `);
    expect(field(node, "config", "delimiter")?.type).toBe(
      '"COMMA" | "TAB" | "PIPE"',
    );
  });

  it("handles a ConfigNode (no input/output/complete)", () => {
    const [node] = extract(`
      import { ConfigNode } from "@bonsae/nrg/server";
      type Config = { host: string; mode: "tcp" | "udp" };
      export default class Server extends ConfigNode<Config> {
        static readonly type = "server";
      }
    `);
    expect(node.kind).toBe("config");
    expect(field(node, "config", "mode")?.type).toBe('"tcp" | "udp"');
    expect(node.input).toBeUndefined();
    expect(node.outputs).toBeUndefined();
    expect(node.complete).toBeUndefined();
  });

  it("omits a node with no static type", () => {
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class Nameless extends IONode<{ a: 1 }> {}
    `);
    expect(nodes).toHaveLength(0);
  });

  it("splits a positional tuple output into one port per element", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Output = [{ a: string }, { b: number }];
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "my-node";
      }
    `);
    expect(node.outputs).toHaveLength(2);
    expect(node.outputs?.[0].name).toBeUndefined();
    expect(portField(node, 0, "a")?.type).toBe("string");
    expect(portField(node, 1, "b")?.type).toBe("number");
  });

  it("splits a schema-typed Port<> record output into one port per name", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Infer, Port } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Outputs = {
        success: defineSchema({ payload: SchemaType.String() }, { $id: "n:success" }),
        failure: defineSchema({ error: SchemaType.String() }, { $id: "n:failure" }),
      };
      type Output = {
        success: Port<Infer<typeof Outputs.success>>;
        failure: Port<Infer<typeof Outputs.failure>>;
      };
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "my-node";
      }
    `);
    const names = node.outputs?.map((o) => o.name);
    expect(names).toContain("success");
    expect(names).toContain("failure");
    const success = node.outputs?.find((o) => o.name === "success");
    expect(success?.role.fields.find((f) => f.name === "payload")?.type).toBe(
      "string",
    );
  });

  it("reads a record of Port<T> in the Output generic as named ports", () => {
    // Topology from the generic, no schema anywhere — a record whose values are
    // Ports is read as named ports, and each Port is unwrapped to its message
    // type. A plain object (values NOT Ports) stays a single object port.
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Port } from "@bonsae/nrg/server";
      type Output = {
        success: Port<{ payload: string }>;
        failure: Port<{ error: string }>;
      };
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "my-node";
      }
    `);
    const names = node.outputs?.map((o) => o.name);
    expect(names).toContain("success");
    expect(names).toContain("failure");
    const success = node.outputs?.find((o) => o.name === "success");
    // Port<{ payload }> unwraps to the message type
    expect(success?.role.fields.find((f) => f.name === "payload")?.type).toBe(
      "string",
    );
    expect(names).not.toContain("__nrg_port");
  });

  it("does not leak array prototype/symbol members as fields for an array-typed port", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Port } from "@bonsae/nrg/server";
      type Output = { rows: Port<{ id: number }[]> };
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "my-node";
      }
    `);
    const rows = node.outputs?.find((o) => o.name === "rows");
    expect(rows).toBeDefined();
    // The port carries an array — its documented type IS the array (in role.text),
    // and it exposes NO per-field rows: `push`/`length`/`__@iterator` must not
    // leak in as documentable fields.
    expect(rows?.role.fields).toEqual([]);
    const names = rows?.role.fields.map((f) => f.name) ?? [];
    expect(names).not.toContain("push");
    expect(names).not.toContain("length");
    expect(names.some((n) => n.startsWith("__@"))).toBe(false);
  });

  it("omits outputs when the Output type is absent (never)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, never> {
        static readonly type = "my-node";
      }
    `);
    expect(node.outputs).toBeUndefined();
  });

  it("makes one untyped port for an any / unknown output", () => {
    const [anyOut] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class AnyOut extends IONode<{ x: 1 }, never, { p: 1 }, any> {
        static readonly type = "any-out";
      }
    `);
    expect(anyOut.outputs).toHaveLength(1);

    const [unknownOut] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class UnknownOut extends IONode<{ x: 1 }, never, { p: 1 }, unknown> {
        static readonly type = "unknown-out";
      }
    `);
    expect(unknownOut.outputs).toHaveLength(1);
  });

  it("recovers the settings role from the 5th generic", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Settings = { apiKey: string };
      export default class MyNode extends IONode<{ x: 1 }, never, never, never, Settings> {
        static readonly type = "my-node";
      }
    `);
    expect(field(node, "settings", "apiKey")?.type).toBe("string");
  });

  it("skips the complete port when input() returns void", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ x: 1 }> {
        static readonly type = "my-node";
        async input(): Promise<void> {}
      }
    `);
    expect(node.complete).toBeUndefined();
  });
});

describe("portTopology (generic-derived __nrgPorts descriptor)", () => {
  it("derives named ports + input port from typed generics", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Port } from "@bonsae/nrg/server";
      type Output = { success: Port<{ a: 1 }>; failure: Port<{ b: 2 }> };
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "my-node";
      }
    `);
    expect(portTopology(node)).toEqual({
      inputs: 1,
      outputs: 2,
      outputNames: ["success", "failure"],
    });
  });

  it("a single object output is one port with no names", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }, { r: 1 }> {
        static readonly type = "my-node";
      }
    `);
    expect(portTopology(node)).toEqual({
      inputs: 1,
      outputs: 1,
      outputNames: undefined,
    });
  });

  it("no Input generic → no input port (generics are the source of truth)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ x: 1 }, never, never, { r: 1 }> {
        static readonly type = "my-node";
      }
    `);
    expect(portTopology(node)).toEqual({
      inputs: 0,
      outputs: 1,
      outputNames: undefined,
    });
  });

  it("gives a bare IONode (all-any defaults) one untyped input and output", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode {
        static readonly type = "my-node";
      }
    `);
    // Every generic defaults to \`any\`, and \`any\` makes a port, so a bare IONode
    // is a simple 1-in / 1-out node.
    expect(portTopology(node)).toMatchObject({ inputs: 1, outputs: 1 });
  });

  it("returns undefined only when NEITHER Input nor Output makes a port (both never)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ c: 1 }, never, never, never> {
        static readonly type = "my-node";
      }
    `);
    expect(portTopology(node)).toBeUndefined();
  });
});
