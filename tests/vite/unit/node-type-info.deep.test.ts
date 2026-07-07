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

// Deep coverage for the type extractor — the SOURCE OF TRUTH for node help docs.
// Mirrors the helper pattern in node-type-info.test.ts: resolve
// `@bonsae/nrg/server` and `@bonsae/nrg/schema` to the repo's own source so
// IONode/ConfigNode generics, Infer, NodeRef and TypedInput are the real types,
// then assert the recovered roles/ports/fields (and the exact rendered type
// strings, which are what the Type column of the help table shows).

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-type-info-deep-"));

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

describe("extractNodeTypes — output shapes (deep)", () => {
  it("single (inline) object output → one positional port carrying every field", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, { result: string; ok: boolean }> {
        static readonly type = "single-obj";
      }
    `);
    expect(node.outputs).toHaveLength(1);
    expect(node.outputs?.[0].index).toBe(0);
    // a single object output is positional → no port name
    expect(node.outputs?.[0].name).toBeUndefined();
    expect(portField(node, 0, "result")?.type).toBe("string");
    expect(portField(node, 0, "ok")?.type).toBe("boolean");
    // inline (anonymous) object → rendered expanded (contrast the aliased case
    // below, GAP B, which renders as the alias identifier)
    expect(node.outputs?.[0].role.text).toBe(
      "{ result: string; ok: boolean; }",
    );
  });

  it("positional tuple of three → three positional ports, indexed in order", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Output = [{ a: string }, { b: number }, { c: boolean }];
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "tuple3";
      }
    `);
    expect(node.outputs).toHaveLength(3);
    expect(node.outputs?.map((o) => o.index)).toEqual([0, 1, 2]);
    // positional → none carry a name
    expect(node.outputs?.every((o) => o.name === undefined)).toBe(true);
    expect(portField(node, 0, "a")?.type).toBe("string");
    expect(portField(node, 1, "b")?.type).toBe("number");
    expect(portField(node, 2, "c")?.type).toBe("boolean");
  });

  it("named-port record → one named port per key, each with its fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Outputs = {
        success: defineSchema({ payload: SchemaType.String() }, { $id: "n:s" }),
        failure: defineSchema({ error: SchemaType.String(), code: SchemaType.Number() }, { $id: "n:f" }),
      };
      type Output = Infer<typeof Outputs>;
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "named-multi";
      }
    `);
    expect(node.outputs).toHaveLength(2);
    const names = node.outputs?.map((o) => o.name);
    expect(names).toEqual(["success", "failure"]);
    expect(node.outputs?.map((o) => o.index)).toEqual([0, 1]);
    const success = node.outputs?.find((o) => o.name === "success");
    expect(success?.role.fields.find((f) => f.name === "payload")?.type).toBe(
      "string",
    );
    const failure = node.outputs?.find((o) => o.name === "failure");
    expect(failure?.role.fields.find((f) => f.name === "code")?.type).toBe(
      "number",
    );
    // the brand property is never surfaced as a port
    expect(names).not.toContain("__nrg_named_ports");
  });

  it("a single named port → one named port (the brand still discriminates it)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      import type { Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      const Outputs = {
        only: defineSchema({ value: SchemaType.String() }, { $id: "n:only" }),
      };
      type Output = Infer<typeof Outputs>;
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "named-one";
      }
    `);
    expect(node.outputs).toHaveLength(1);
    expect(node.outputs?.[0].name).toBe("only");
    expect(node.outputs?.[0].index).toBe(0);
    expect(portField(node, 0, "value")?.type).toBe("string");
  });

  it("primitive output → one positional port with a clean type, no leaked fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, string> {
        static readonly type = "primitive-out";
      }
    `);
    expect(node.outputs).toHaveLength(1);
    expect(node.outputs?.[0].name).toBeUndefined();
    expect(node.outputs?.[0].role.text).toBe("string");
    // A primitive has no documentable members — no String.prototype leak.
    expect(node.outputs?.[0].role.fields).toHaveLength(0);
  });

  it("INLINE union output → text expands verbatim, with no leaked fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, "a" | "b"> {
        static readonly type = "inline-union-out";
      }
    `);
    expect(node.outputs).toHaveLength(1);
    // an inline (anonymous) union is rendered expanded — good.
    expect(node.outputs?.[0].role.text).toBe('"a" | "b"');
    // A union carries no object members — no String.prototype leak.
    expect(node.outputs?.[0].role.fields).toHaveLength(0);
  });

  it("ALIASED union output → expanded to the union (self-contained, not the alias name)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Output = "created" | "updated" | "deleted";
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "aliased-union-out";
      }
    `);
    expect(node.outputs).toHaveLength(1);
    // A top-level named alias is expanded (InTypeAlias) so the rendered type is
    // self-contained — consistent with the inline-union case and usable in the
    // generated .d.ts, where the alias name would be an unresolved reference.
    expect(node.outputs?.[0].role.text).toBe(
      '"created" | "updated" | "deleted"',
    );
  });
});

describe("extractNodeTypes — complete port from input() (deep)", () => {
  it("sync object return → complete carries its fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "sync-complete";
        input() {
          return { ok: true, n: 1 };
        }
      }
    `);
    expect(field(node, "complete", "ok")?.type).toBe("boolean");
    expect(field(node, "complete", "n")?.type).toBe("number");
  });

  it("async object return → Promise unwrapped to its fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "async-complete";
        async input() {
          return { done: true };
        }
      }
    `);
    expect(field(node, "complete", "done")?.type).toBe("boolean");
  });

  it("explicit Promise<object> return annotation → unwrapped", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "promise-annot";
        async input(): Promise<{ id: string }> {
          return { id: "" };
        }
      }
    `);
    expect(field(node, "complete", "id")?.type).toBe("string");
  });

  it("sync void return → complete omitted", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "sync-void";
        input(): void {}
      }
    `);
    expect(node.complete).toBeUndefined();
  });

  it("union return → complete carries the union, no shared fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "union-complete";
        async input(): Promise<{ a: number } | { b: number }> {
          return { a: 1 };
        }
      }
    `);
    expect(node.complete?.text).toBe("{ a: number; } | { b: number; }");
    expect(node.complete?.fields).toEqual([]);
  });

  it("nested object return → the nested field is rendered structurally", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "nested-complete";
        async input() {
          return { meta: { id: "x", count: 1 } };
        }
      }
    `);
    expect(field(node, "complete", "meta")?.type).toBe(
      "{ id: string; count: number; }",
    );
  });
});

describe("extractNodeTypes — settings (deep)", () => {
  it("IONode reads settings from the 5th generic (input/output stay empty)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Settings = { apiKey: string; retries: number };
      export default class N extends IONode<{ x: 1 }, never, never, never, Settings> {
        static readonly type = "io-settings";
      }
    `);
    expect(node.kind).toBe("io");
    expect(field(node, "settings", "apiKey")?.type).toBe("string");
    expect(field(node, "settings", "retries")?.type).toBe("number");
    // input=never, output=never → both omitted
    expect(node.input).toBeUndefined();
    expect(node.outputs).toBeUndefined();
  });

  it("ConfigNode reads settings from the 3rd generic", () => {
    const [node] = extract(`
      import { ConfigNode } from "@bonsae/nrg/server";
      type Settings = { region: string };
      export default class N extends ConfigNode<{ host: string }, never, Settings> {
        static readonly type = "config-settings";
      }
    `);
    expect(node.kind).toBe("config");
    expect(field(node, "settings", "region")?.type).toBe("string");
    // config nodes never carry io-only roles
    expect(node.input).toBeUndefined();
    expect(node.outputs).toBeUndefined();
    expect(node.complete).toBeUndefined();
  });
});

describe("extractNodeTypes — field details (deep)", () => {
  it("marks optional vs required fields", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { a: string; b?: number };
      export default class N extends IONode<Config> {
        static readonly type = "optional-fields";
      }
    `);
    expect(field(node, "config", "a")?.optional).toBe(false);
    expect(field(node, "config", "b")?.optional).toBe(true);
    // Optionality is carried by the `optional` flag alone — the rendered type
    // is the bare `number`, not `number | undefined`.
    expect(field(node, "config", "b")?.type).toBe("number");
  });

  it("renders a nested object field structurally", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { profile: { name: string; age: number } };
      export default class N extends IONode<Config> {
        static readonly type = "nested-field";
      }
    `);
    expect(field(node, "config", "profile")?.type).toBe(
      "{ name: string; age: number; }",
    );
  });

  it("renders array fields via the WriteArrayAsGenericType flag (Array<T>)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { tags: string[]; nums: number[] };
      export default class N extends IONode<Config> {
        static readonly type = "array-fields";
      }
    `);
    expect(field(node, "config", "tags")?.type).toBe("Array<string>");
    expect(field(node, "config", "nums")?.type).toBe("Array<number>");
  });

  it("renders a string-literal-union field verbatim", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { level: "low" | "medium" | "high" };
      export default class N extends IONode<Config> {
        static readonly type = "literal-union-field";
      }
    `);
    expect(field(node, "config", "level")?.type).toBe(
      '"low" | "medium" | "high"',
    );
  });

  it("resolves a NodeRef field to the config node instance and TypedInput to the wrapper", () => {
    const [node] = extract(`
      import { IONode, ConfigNode } from "@bonsae/nrg/server";
      import type { Infer } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      class Broker extends ConfigNode<{ host: string }> {
        static readonly type = "broker";
      }
      const Config = defineSchema({
        broker: SchemaType.NodeRef<Broker>("broker"),
        token: SchemaType.TypedInput<string>(),
      }, { $id: "n:config" });
      type Config = Infer<typeof Config>;
      export default class N extends IONode<Config> {
        static readonly type = "ref-typedinput";
      }
    `);
    // only the default-export class is a node; the Broker config class is not
    // exported/default, so it is not surfaced as its own entry.
    expect(node.type).toBe("ref-typedinput");
    // NodeRef resolves (server plane) to the referenced config node instance,
    // and renders cleanly as the config class name.
    expect(field(node, "config", "broker")?.type).toBe("Broker");
    // TypedInput resolves to the server `TypedInput<T>` wrapper (a default
    // export). The leaked `import("<abs path>").default<…>` form is cleaned up
    // to the readable declared name — no filesystem path in the docs.
    const tokenType = field(node, "config", "token")?.type ?? "";
    expect(tokenType).toBe("TypedInput<string>");
    expect(tokenType).not.toContain("import(");
    expect(tokenType).not.toContain(REPO);
  });
});

describe("extractNodeTypes — class resolution edge cases (deep)", () => {
  it("resolves the framework base through an intermediate base class", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { a: string };
      type Input = { p: number };
      type Output = { r: string };
      class Base extends IONode<Config, never, Input, Output> {}
      export default class N extends Base {
        static readonly type = "via-intermediate";
      }
    `);
    expect(node).toBeDefined();
    expect(node.type).toBe("via-intermediate");
    expect(node.kind).toBe("io");
    expect(field(node, "config", "a")?.type).toBe("string");
    expect(field(node, "input", "p")?.type).toBe("number");
    expect(portField(node, 0, "r")?.type).toBe("string");
  });

  it("skips a non-default-export node class", () => {
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export class Named extends IONode<{ a: string }> {
        static readonly type = "named-export";
      }
    `);
    expect(nodes).toHaveLength(0);
  });

  it("skips a default-export class with a framework base but no static type", () => {
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ a: string }> {}
    `);
    expect(nodes).toHaveLength(0);
  });
});
