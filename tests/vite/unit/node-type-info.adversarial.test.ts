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
import { generateHelpDoc } from "@/tools/vite/client/plugins/help-generator";
import { getHelpTranslations } from "@/tools/vite/client/plugins/help-i18n";

// Adversarial gap-hunting for the type-driven help extractor + generator. Each
// case tries to BREAK the extractor with a pathological node shape and asserts
// the ACTUAL behavior (the extractor must never throw), flagging degraded/wrong
// output. Where the output is WRONG, the test asserts the buggy actual behavior
// and the finding is recorded in the task's "gaps"; the corresponding
// user-facing help HTML is rendered via generateHelpDoc to prove the impact.
//
// Program-building mirrors node-type-info.test.ts so IONode/ConfigNode generics
// resolve against the repo's own source.

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-type-info-adv-"));
const T = getHelpTranslations("en-US");

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

/** Render the help HTML a user would see for an extracted node (no schema). */
function help(info: NodeTypeInfo): string {
  return generateHelpDoc({ type: info.type }, {}, T, undefined, info);
}

describe("adversarial — extractor never throws on pathological shapes", () => {
  it("handles inline object types written directly in the generics", () => {
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { IONode } from "@bonsae/nrg/server";
        export default class N extends IONode<{ a: string }, never, { b: number }> {
          static readonly type = "n";
        }
      `);
    }).not.toThrow();
    const [node] = nodes;
    // Correct: inline anonymous object types resolve like named ones.
    expect(field(node, "config", "a")?.type).toBe("string");
    expect(field(node, "input", "b")?.type).toBe("number");
    expect(node.credentials).toBeUndefined(); // never → omitted
  });

  it("resolves a recursive/self-referential config type without looping", () => {
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { IONode } from "@bonsae/nrg/server";
        type Tree = { value: number; children: Tree[] };
        export default class N extends IONode<Tree> {
          static readonly type = "n";
        }
      `);
    }).not.toThrow();
    const [node] = nodes;
    expect(field(node, "config", "value")?.type).toBe("number");
    // The self-reference is rendered by name, not expanded (no infinite loop).
    expect(field(node, "config", "children")?.type).toMatch(/Tree/);
  });

  it("renders a very large string-literal union verbatim (no truncation)", () => {
    const members = Array.from({ length: 120 }, (_, i) => `"m${i}"`).join(
      " | ",
    );
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { IONode } from "@bonsae/nrg/server";
        type Config = { kind: ${members} };
        export default class N extends IONode<Config> {
          static readonly type = "n";
        }
      `);
    }).not.toThrow();
    const kind = field(nodes[0], "config", "kind")?.type ?? "";
    // NoTruncation is set, so all 120 members survive (first + last present).
    expect(kind).toContain('"m0"');
    expect(kind).toContain('"m119"');
    expect(kind).not.toContain("..."); // not the TS "… N more" truncation
  });

  it("renders an empty object output ({}) as a single {} port", () => {
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { IONode } from "@bonsae/nrg/server";
        export default class N extends IONode<{ x: 1 }, never, { p: 1 }, {}> {
          static readonly type = "n";
        }
      `);
    }).not.toThrow();
    const [node] = nodes;
    // {} is not vacuous (not any/void), so it survives as one port with no fields.
    expect(node.outputs).toHaveLength(1);
    expect(node.outputs?.[0].role.text).toBe("{}");
    expect(node.outputs?.[0].role.fields).toHaveLength(0);
  });

  it("keeps an index-signature-typed field's element type on the parent", () => {
    // Nested index signatures are fine — the parent property carries the text.
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Config = { meta: { [k: string]: number } };
      export default class N extends IONode<Config> {
        static readonly type = "n";
      }
    `);
    expect(field(node, "config", "meta")?.type).toMatch(/\[.*\]: number/);
  });

  it("drops a TOP-LEVEL index-signature config from the rendered docs (see gap)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ [k: string]: number }> {
        static readonly type = "n";
      }
    `);
    // The role text is preserved, but index signatures produce no named
    // properties, so there are no rows...
    expect(node.config?.text).toMatch(/\[.*\]: number/);
    expect(node.config?.fields).toHaveLength(0);
    // ...and the generator, which keys rows off fields, emits NO Properties
    // section at all — the config is invisible in the help doc.
    expect(help(node)).not.toContain("Properties");
  });
});

describe("adversarial — Output shape variants", () => {
  it("splits a tuple whose FIRST element is a primitive (no prototype leak)", () => {
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { IONode } from "@bonsae/nrg/server";
        type Output = [string, { a: 1 }];
        export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
          static readonly type = "n";
        }
      `);
    }).not.toThrow();
    const [node] = nodes;
    expect(node.outputs).toHaveLength(2);

    // Port 1 (object element) is correct.
    expect(portField(node, 1, "a")?.type).toBe("1");

    // Port 0's element is the primitive `string` — no prototype members leak.
    expect(node.outputs?.[0].role.text).toBe("string");
    expect(node.outputs?.[0].role.fields).toHaveLength(0);
    expect(portField(node, 0, "charAt")).toBeUndefined();

    // The rendered docs never list a prototype member like `charAt`.
    expect(help(node)).not.toContain("charAt");
  });

  it("detects a HAND-WRITTEN & NamedPortsBrand record the same as Infer<>", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Output = { success: { payload: string }; failure: { error: string } } & {
        readonly __nrg_named_ports: true;
      };
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "n";
      }
    `);
    const names = node.outputs?.map((o) => o.name);
    expect(names).toContain("success");
    expect(names).toContain("failure");
    // The brand itself is never surfaced as a port.
    expect(names).not.toContain("__nrg_named_ports");
    expect(
      node.outputs
        ?.find((o) => o.name === "success")
        ?.role.fields.find((f) => f.name === "payload")?.type,
    ).toBe("string");
  });

  it("keeps a named port whose value is a PRIMITIVE (no prototype leak)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      type Output = { count: number; ok: { flag: boolean } } & {
        readonly __nrg_named_ports: true;
      };
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, Output> {
        static readonly type = "n";
      }
    `);
    const ok = node.outputs?.find((o) => o.name === "ok");
    expect(ok?.role.fields.find((f) => f.name === "flag")?.type).toBe(
      "boolean",
    );

    // The `count` named port is the primitive `number` — a clean type, no
    // Number.prototype members surfaced as fields.
    const count = node.outputs?.find((o) => o.name === "count");
    expect(count?.role.text).toBe("number");
    expect(count?.role.fields).toHaveLength(0);
  });

  it("renders a single primitive Output as a clean type (no prototype leak)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }, never, { p: 1 }, string> {
        static readonly type = "n";
      }
    `);
    expect(node.outputs).toHaveLength(1);
    expect(node.outputs?.[0].role.text).toBe("string");
    // The primitive renders as a clean `string` line — no leaked members.
    expect(node.outputs?.[0].role.fields).toHaveLength(0);
  });
});

describe("adversarial — complete port from input() return type", () => {
  it("renders a primitive complete-port type as a clean code line (no leak)", () => {
    const [node] = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ x: 1 }> {
        static readonly type = "n";
        async input(): Promise<number> { return 1; }
      }
    `);
    expect(node.complete?.text).toBe("number");
    // A scalar complete value has no fields — no Number.prototype leak.
    expect(node.complete?.fields).toHaveLength(0);

    const html = help(node);
    expect(html).toContain("Complete");
    // Rendered as a `<code>number</code>` line, never a method table.
    expect(html).toContain("<code>number</code>");
    expect(html).not.toContain("toFixed");
  });
});

describe("adversarial — node discovery gaps", () => {
  it("extracts a node whose static type has a literal-type annotation", () => {
    // Baseline: `static readonly type: "n" = "n"` still resolves.
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ a: string }> {
        static readonly type: "n" = "n";
      }
    `);
    expect(nodes.map((n) => n.type)).toEqual(["n"]);
  });

  it("extracts a node whose static type uses `as const`", () => {
    // `static readonly type = "n" as const` is idiomatic TS — the AsExpression
    // wrapper is unwrapped to the underlying string literal.
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class N extends IONode<{ a: string }> {
        static readonly type = "n" as const;
      }
    `);
    expect(nodes.map((n) => n.type)).toEqual(["n"]);
  });

  it("DROPS a node whose static type references a const (see gap)", () => {
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      const TYPE = "n";
      export default class N extends IONode<{ a: string }> {
        static readonly type = TYPE;
      }
    `);
    expect(nodes).toHaveLength(0);
  });

  it("extracts a class exported via `export { X as default }`", () => {
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      class N extends IONode<{ a: string }> {
        static readonly type = "n";
      }
      export { N as default };
    `);
    // The re-export-as-default form is resolved back to the class declaration.
    expect(nodes.map((n) => n.type)).toEqual(["n"]);
  });

  it("extracts a functional defineIONode node", () => {
    const [node] = extract(`
      import { defineIONode } from "@bonsae/nrg/server";
      import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
      export default defineIONode<{ a: string }>({
        type: "fn",
        configSchema: defineSchema({ a: SchemaType.String() }, { $id: "n:c" }),
        async input() {},
      });
    `);
    // Functional nodes are recovered from the call's return type.
    expect(node?.type).toBe("fn");
    expect(field(node, "config", "a")?.type).toBe("string");
  });

  it("extracts ONLY the default export when a file has two node classes", () => {
    const nodes = extract(`
      import { IONode } from "@bonsae/nrg/server";
      export default class A extends IONode<{ a: string }> {
        static readonly type = "a";
      }
      export class B extends IONode<{ b: string }> {
        static readonly type = "b";
      }
    `);
    // By design, one default-export node per file — the named class is ignored.
    expect(nodes.map((n) => n.type)).toEqual(["a"]);
  });

  it("does not throw when a class extends IONode with ZERO generics", () => {
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { IONode } from "@bonsae/nrg/server";
        export default class N extends IONode {
          static readonly type = "n";
        }
      `);
    }).not.toThrow();
    const [node] = nodes;
    expect(node.type).toBe("n");
    expect(node.kind).toBe("io");
    // Every generic defaults to `any` (vacuous) → no documented roles/ports.
    expect(node.config).toBeUndefined();
    expect(node.input).toBeUndefined();
    expect(node.outputs).toBeUndefined();
    expect(node.complete).toBeUndefined();
  });

  it("does not throw for a ConfigNode with fewer generics than slots", () => {
    let nodes: NodeTypeInfo[] = [];
    expect(() => {
      nodes = extract(`
        import { ConfigNode } from "@bonsae/nrg/server";
        export default class N extends ConfigNode<{ host: string }> {
          static readonly type = "cfg";
        }
      `);
    }).not.toThrow();
    const [node] = nodes;
    expect(node.kind).toBe("config");
    expect(field(node, "config", "host")?.type).toBe("string");
    // IO-only roles never appear on a config node.
    expect(node.input).toBeUndefined();
    expect(node.outputs).toBeUndefined();
    expect(node.complete).toBeUndefined();
  });
});
