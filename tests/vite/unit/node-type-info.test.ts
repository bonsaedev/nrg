import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import ts from "typescript";
import {
  extractNodeTypes,
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

  it("splits a named-port record output into one port per name", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Outputs = {
        success: defineSchema({ payload: SchemaType.String() }, { $id: "n:success" }),
        failure: defineSchema({ error: SchemaType.String() }, { $id: "n:failure" }),
      };
      type Output = Infer<typeof Outputs>;
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
    // the __nrg_named_ports brand is never surfaced as a port
    expect(names).not.toContain("__nrg_named_ports");
  });

  it("omits outputs when the Output type is absent (any)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class MyNode extends IONode<{ x: 1 }, never, { p: 1 }> {
        static readonly type = "my-node";
      }
    `);
    expect(node.outputs).toBeUndefined();
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
