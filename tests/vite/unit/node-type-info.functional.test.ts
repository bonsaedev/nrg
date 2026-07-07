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
  type NodeTypeInfo,
} from "@/tools/vite/server/plugins/node-type-info";

// Functional-API coverage: `export default defineIONode/defineConfigNode({…})`.
// Roles are recovered from the call's return type (NodeConstructor<IIONode<…>>)
// and the complete port from the inline `input` handler's return type. Program
// resolution mirrors node-type-info.test.ts.

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-type-info-fn-"));

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

describe("extractNodeTypes — functional API", () => {
  it("recovers config/input/output roles from a defineIONode node", () => {
    const [node] = extract(`
      import { defineIONode, type Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Config = defineSchema(
        { name: SchemaType.String(), retries: SchemaType.Number() },
        { $id: "fn:config" },
      );
      type Input = { payload: string };
      type Output = { result: string };
      export default defineIONode<Infer<typeof Config>, any, Input, Output>({
        type: "fn",
        configSchema: Config,
        input(msg) {
          return { done: true, count: 1 };
        },
      });
    `);

    expect(node.type).toBe("fn");
    expect(node.kind).toBe("io");
    expect(field(node, "config", "name")?.type).toBe("string");
    expect(field(node, "config", "retries")?.type).toBe("number");
    expect(field(node, "input", "payload")?.type).toBe("string");
    expect(node.outputs).toHaveLength(1);
    expect(portField(node, 0, "result")?.type).toBe("string");
  });

  it("derives the complete port from the inline input handler's return type", () => {
    const [node] = extract(`
      import { defineIONode } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Config = defineSchema({ x: SchemaType.Number() }, { $id: "fn:config" });
      export default defineIONode({
        type: "fn",
        configSchema: Config,
        input() {
          return { done: true, count: 1 };
        },
      });
    `);
    expect(field(node, "complete", "done")?.type).toBe("boolean");
    expect(field(node, "complete", "count")?.type).toBe("number");
  });

  it("splits a named-port Output type into named ports", () => {
    const [node] = extract(`
      import { defineIONode, type Port } from "@bonsae/nrg/server";
      type Output = {
        success: Port<{ payload: string }>;
        failure: Port<{ error: string }>;
      };
      export default defineIONode<any, any, unknown, Output>({
        type: "fn",
        input() {},
      });
    `);
    const names = node.outputs?.map((o) => o.name);
    expect(names).toEqual(["success", "failure"]);
    expect(names).not.toContain("__nrg_named_ports");
    const success = node.outputs?.find((o) => o.name === "success");
    expect(success?.role.fields.find((f) => f.name === "payload")?.type).toBe(
      "string",
    );
  });

  it("splits a positional (tuple) Output type into positional ports", () => {
    const [node] = extract(`
      import { defineIONode } from "@bonsae/nrg/server";
      type Output = [{ a: string }, { b: number }];
      export default defineIONode<any, any, unknown, Output>({
        type: "fn",
        input() {},
      });
    `);
    expect(node.outputs).toHaveLength(2);
    expect(node.outputs?.every((o) => o.name === undefined)).toBe(true);
    expect(portField(node, 0, "a")?.type).toBe("string");
    expect(portField(node, 1, "b")?.type).toBe("number");
  });

  it("recovers a defineConfigNode node (config only, no io roles)", () => {
    const [node] = extract(`
      import { defineConfigNode, type Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Config = defineSchema(
        { host: SchemaType.String(), port: SchemaType.Number() },
        { $id: "cfg:config" },
      );
      export default defineConfigNode<Infer<typeof Config>>({
        type: "cfg",
        configSchema: Config,
      });
    `);
    expect(node.kind).toBe("config");
    expect(field(node, "config", "host")?.type).toBe("string");
    expect(field(node, "config", "port")?.type).toBe("number");
    expect(node.input).toBeUndefined();
    expect(node.outputs).toBeUndefined();
    expect(node.complete).toBeUndefined();
  });

  it("resolves the `const N = defineIONode(...); export default N` form", () => {
    const [node] = extract(`
      import { defineIONode, type Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Config = defineSchema({ name: SchemaType.String() }, { $id: "fn:config" });
      const Node = defineIONode<Infer<typeof Config>>({ type: "fn", configSchema: Config, input() {} });
      export default Node;
    `);
    expect(node?.type).toBe("fn");
    expect(field(node, "config", "name")?.type).toBe("string");
  });
});
