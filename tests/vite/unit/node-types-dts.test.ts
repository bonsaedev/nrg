import { describe, it, expect, afterAll, vi } from "vitest";

// Each case runs a real `tsc` compile; under CI's --coverage (v8 instrumentation)
// each compile is several-fold slower and can exceed vitest's default 5s timeout.
// Widen it so coverage-slowed compiles aren't reported as false timeouts.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import fs from "fs";
import path from "path";
import os from "os";
import ts from "typescript";
import { extractNodeTypes } from "@/tools/vite/server/plugins/node-type-info";
import { buildPackageDts } from "@/tools/vite/server/plugins/node-types-dts";

// Validates the generated flat index.d.ts end-to-end. Nodes are extracted from
// real source (the checker resolves @bonsae/nrg/server for real), the package
// .d.ts is generated, then COMPILED against a minimal mock @bonsae/nrg/server to
// prove three things at once: (a) the classes are inheritable, (b) the NodeTypes
// registry augmentation merges, (c) a synthesized wire type-checks / errors.

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-pkg-dts-"));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;

/** Extract every node from a set of {name → source} files (real nrg types). */
function extractPkg(files: Record<string, string>) {
  const dir = path.join(TMP, `x-${counter++}`);
  const nodesDir = path.join(dir, "nodes");
  fs.mkdirSync(nodesDir, { recursive: true });
  const roots = Object.entries(files).map(([name, src]) => {
    const f = path.join(nodesDir, `${name}.ts`);
    fs.writeFileSync(f, src);
    return f;
  });
  const program = ts.createProgram({
    rootNames: roots,
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

/**
 * Compile the generated package .d.ts + a consumer file against the REAL
 * @bonsae/nrg/server (via paths), proving the framework's NodeTypes / ErrorPort
 * / StatusPort exports and the augmentation resolve for real.
 */
function compilePackage(
  dts: string,
  consumer: string,
): readonly ts.Diagnostic[] {
  const dir = path.join(TMP, `c-${counter++}`);
  const write = (rel: string, content: string) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  write("index.d.ts", dts);
  write("consumer.ts", consumer);

  const program = ts.createProgram({
    rootNames: [path.join(dir, "consumer.ts")],
    options: {
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: dir,
      paths: {
        "acme-nodes": [path.join(dir, "index.d.ts")],
        "@bonsae/nrg/server": [path.join(REPO, "src/sdk/lib/server/index.ts")],
        "@bonsae/nrg/schema": [
          path.join(REPO, "src/sdk/lib/shared/schemas/index.ts"),
        ],
      },
    },
  });
  // Only diagnostics in the generated .d.ts / consumer count — the real nrg
  // source is pulled in for resolution but is type-checked under a stricter
  // program than the repo's tsconfig (noImplicitAny), so ignore its own noise.
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file && path.resolve(d.file.fileName).startsWith(dir));
}

const PKG = {
  "csv-parser": `
    import { IONode } from "@bonsae/nrg/server";
    import type { Infer } from "@bonsae/nrg/server";
    import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
    type Config = { delimiter: "COMMA" | "TAB"; skipHeader: boolean };
    const Outputs = {
      success: defineSchema({ payload: SchemaType.String() }, { $id: "c:s" }),
      failure: defineSchema({ error: SchemaType.String() }, { $id: "c:f" }),
    };
    export default class CsvParser extends IONode<Config, never, { text: string }, Infer<typeof Outputs>> {
      static readonly type = "csv-parser";
      async input(msg: { text: string }) { return { parsed: 42 }; }
    }
  `,
  consumer: `
    import { IONode } from "@bonsae/nrg/server";
    export default class Consumer extends IONode<{ c: 1 }, never, { payload: string }> {
      static readonly type = "consumer";
    }
  `,
};

// A package whose IONode has a NodeRef config field pointing at a config node
// that IS emitted (both are default exports → both get class decls).
const PKG_NODEREF = {
  connection: `
    import { ConfigNode } from "@bonsae/nrg/server";
    export default class Connection extends ConfigNode<{ host: string }> {
      static readonly type = "connection";
    }
  `,
  dml: `
    import { IONode } from "@bonsae/nrg/server";
    import type { Infer } from "@bonsae/nrg/server";
    import { defineSchema, SchemaType } from "@bonsae/nrg/schema";
    import type Connection from "./connection";
    const Config = defineSchema({
      connection: SchemaType.NodeRef<Connection>("connection"),
      name: SchemaType.String(),
    }, { $id: "dml:config" });
    export default class Dml extends IONode<Infer<typeof Config>, never, { payload: string }> {
      static readonly type = "dml";
      async input(_msg: { payload: string }) {}
    }
  `,
};

describe("buildPackageDts", () => {
  it("emits inheritable classes, the registry augmentation, and a default", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    expect(dts).toContain("export declare class CsvParser extends IONode<");
    expect(dts).toContain('static readonly type: "csv-parser";');
    expect(dts).toContain(
      "input(msg: { text: string; }): Promise<{ parsed: number; }>",
    );
    expect(dts).toContain('declare module "@bonsae/nrg/server"');
    expect(dts).toContain("interface NodeTypes {");
    expect(dts).toContain('"csv-parser": {');
    expect(dts).toContain(
      "outputs: [{ payload: string; }, { error: string; }]",
    );
    expect(dts).toContain("export default _default;");
  });

  it("the generated .d.ts compiles clean against the framework", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    // A no-op consumer that just imports the package (loads the augmentation).
    expect(compilePackage(dts, `import "acme-nodes";\n`)).toHaveLength(0);
  });

  it("lets a consumer inherit a node class", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    const diags = compilePackage(
      dts,
      `import { CsvParser } from "acme-nodes";
       export class MyCsv extends CsvParser {}
       const t: "csv-parser" = MyCsv.type;`,
    );
    expect(diags).toHaveLength(0);
  });

  it("preserves named-port Port<> so a subclass keeps its named ports", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    // Named outputs are re-wrapped in Port<> in the inheritable class (a bare
    // `{ success; failure }` would collapse to one object port on inheritance),
    // and Port is imported.
    expect(dts).toContain("success: Port<{ payload: string; }>");
    expect(dts).toContain("failure: Port<{ error: string; }>");
    expect(dts).toMatch(/import type \{[^}]*\bPort\b/);
    // A subclass therefore keeps two NAMED ports — `send("success", …)`
    // only type-checks when the named-ness survived inheritance.
    const diags = compilePackage(
      dts,
      `import { CsvParser } from "acme-nodes";
       export class Mine extends CsvParser {
         demo() { this.send("success", { payload: "x" }); }
       }`,
    );
    expect(diags).toHaveLength(0);
  });

  it("type-checks a COMPATIBLE wire via the registry", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    // csv-parser port 0 (success: { payload: string }) → consumer.input ({ payload: string })
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const _: NodeTypes["consumer"]["input"] = null as unknown as NodeTypes["csv-parser"]["outputs"][0];`,
    );
    expect(diags).toHaveLength(0);
  });

  it("flags an INCOMPATIBLE wire via the registry", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    // csv-parser port 1 (failure: { error: string }) → consumer.input ({ payload: string }) — not connectable
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const _: NodeTypes["consumer"]["input"] = null as unknown as NodeTypes["csv-parser"]["outputs"][1];`,
    );
    expect(diags.length).toBeGreaterThan(0);
  });

  it("strips off-the-wire lanes from the wiring input so a plain upstream value connects (Input<Port<Wire>> → bare Wire)", () => {
    // A REAL node types its input via the gate: `Input<Port<Wire>>`, which resolves
    // to `Wire & MessageLanes`. The registry/wiring input MUST be the bare `Wire`
    // (what a connection carries / `receive()` takes) — if the off-the-wire lanes
    // leaked into it, no upstream port's plain value could ever satisfy
    // `& MessageLanes` and every real wire would be un-connectable.
    const dts = buildPackageDts(
      extractPkg({
        laned: `
          import { IONode } from "@bonsae/nrg/server";
          import type { Input, Outputs, Port } from "@bonsae/nrg/server";
          type LanedInput = Input<Port<{ payload: string }>>;
          type LanedOutputs = Outputs<{ out: Port<{ ok: boolean }> }>;
          export default class Laned extends IONode<{ c: 1 }, never, LanedInput, LanedOutputs> {
            static readonly type = "laned";
            async input(_msg: LanedInput) { this.send("out", { ok: true }); }
          }`,
      }),
    );
    // the input port is the WIRE type, with NO `MessageLanes` anywhere
    expect(dts).toContain("input: { payload: string; };");
    expect(dts).not.toContain("MessageLanes");
    // and the built-in ports are generic over the bare wire, not the laned shape
    expect(dts).toContain("error: ErrorPort<{ payload: string; }>");
    // a plain upstream value (no lanes) type-checks against the input port
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const _: NodeTypes["laned"]["input"] = { payload: "x" };
       void _;`,
    );
    expect(diags).toHaveLength(0);
  });

  it("strips lanes from a MULTI-member wire input (Input<Port<A & B>>) too", () => {
    // The rare multi-member wire takes the text/field fallback (not the clean
    // single-member type strip) — verify no `MessageLanes` survives there either.
    const dts = buildPackageDts(
      extractPkg({
        multi: `
          import { IONode } from "@bonsae/nrg/server";
          import type { Input, Outputs, Port } from "@bonsae/nrg/server";
          type Wire = { a: string } & { b: number };
          export default class Multi extends IONode<{ c: 1 }, never, Input<Port<Wire>>, Outputs<{ out: Port<{ ok: true }> }>> {
            static readonly type = "multi";
            async input(_m: Input<Port<Wire>>) { this.send("out", { ok: true }); }
          }`,
      }),
    );
    expect(dts).not.toContain("MessageLanes");
    // both wire members survive; a plain value with both connects
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const _: NodeTypes["multi"]["input"] = { a: "x", b: 1 };
       void _;`,
    );
    expect(diags).toHaveLength(0);
  });

  it("strips lanes from a UNION wire input (Input<Port<A | B>>) — distributes to (A&lanes)|(B&lanes))", () => {
    // `(A | B) & MessageLanes` DISTRIBUTES to a top-level union `(A & lanes) | (B &
    // lanes)`, so the lane-strip must recurse into each union arm — else lanes leak
    // on every arm and no upstream port could connect to a union-typed input.
    const dts = buildPackageDts(
      extractPkg({
        uni: `
          import { IONode } from "@bonsae/nrg/server";
          import type { Input, Outputs, Port } from "@bonsae/nrg/server";
          type Wire = { a: string } | { b: number };
          export default class Uni extends IONode<{ c: 1 }, never, Input<Port<Wire>>, Outputs<{ out: Port<{ ok: true }> }>> {
            static readonly type = "uni";
            async input(_m: Input<Port<Wire>>) { this.send("out", { ok: true }); }
          }`,
      }),
    );
    expect(dts).not.toContain("MessageLanes");
    // each arm's plain value connects to the union input
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const a: NodeTypes["uni"]["input"] = { a: "x" };
       const b: NodeTypes["uni"]["input"] = { b: 1 };
       void a; void b;`,
    );
    expect(diags).toHaveLength(0);
  });

  it("enriches built-in error/complete ports with the node's input (and return)", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    // Built-in ports are generic over the node's input; complete also over its
    // input() return. (Base `outputs` stay the bare value — see wire tests above.)
    expect(dts).toContain("error: ErrorPort<{ text: string; }>");
    expect(dts).toContain(
      "complete: CompletePort<{ text: string; }, { parsed: number; }>",
    );
    expect(dts).toMatch(/import type \{[^}]*\bCompletePort\b/);
    // A downstream handler can read the carried original input, the `input`
    // provenance frame, and the error metadata off the registry, type-safely.
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const carried: { text: string } =
         null as unknown as NodeTypes["csv-parser"]["error"]["input"];
       const message: string =
         null as unknown as NodeTypes["csv-parser"]["error"]["error"]["message"];
       void carried;
       void message;`,
    );
    expect(diags).toHaveLength(0);
  });

  it("renders a NodeRef field as the emitted config-node class (not `unknown`)", () => {
    const dts = buildPackageDts(extractPkg(PKG_NODEREF));
    expect(dts).toContain("export declare class Dml extends IONode<");
    // The NodeRef config field types as the real config node class — which is
    // emitted as a sibling class decl in this same .d.ts — instead of `unknown`.
    expect(dts).toMatch(/connection:\s*Connection\b/);
    expect(dts).not.toMatch(/connection:\s*unknown/);
    // …and the generated .d.ts still compiles clean (the reference resolves).
    expect(compilePackage(dts, `import "acme-nodes";\n`)).toHaveLength(0);
  });
});

// The built-in complete/error/status ports across the shapes a real package
// hits. The complete port is `CompletePort<Input, Return>`: a STANDARD envelope
// (carried message + completion signal + `input` provenance) that the `input()`
// return type only IMPROVES via `TReturn`, defaulting to `void`. Guards the
// regression where a void-returning node's complete collapsed to `never` (it was
// emitted as the bare return type, `?? "never"`, before the CompletePort wrap).
describe("buildPackageDts — built-in port envelopes", () => {
  /** A single-node package: one default-export IONode, so every assertion is
   * unambiguous (only this node's ports are in the emitted d.ts). */
  const ioPkg = (
    type: string,
    cls: string,
    generics: string,
    body: string,
  ) => ({
    [type]: `
      import { IONode } from "@bonsae/nrg/server";
      export default class ${cls} extends IONode<${generics}> {
        static readonly type = "${type}";
        ${body}
      }
    `,
  });

  it("void-returning input() → complete: CompletePort<Input, void> (the standard envelope, not never)", () => {
    const dts = buildPackageDts(
      extractPkg(
        ioPkg(
          "void-node",
          "VoidNode",
          "{ c: 1 }, never, { payload: string }",
          "async input(_msg: { payload: string }) {}",
        ),
      ),
    );
    expect(dts).toContain(
      "complete: CompletePort<{ payload: string; }, void>;",
    );
    // Regression guard: a void return must NOT collapse the port to `never`.
    expect(dts).not.toMatch(/complete: never/);
    expect(dts).not.toMatch(/CompletePort<[^>]*,\s*never\s*>/);
  });

  it("input() returning a value → complete carries it under TReturn", () => {
    const dts = buildPackageDts(
      extractPkg(
        ioPkg(
          "return-node",
          "ReturnNode",
          "{ c: 1 }, never, { payload: string }",
          "async input(_msg: { payload: string }) { return { ok: true }; }",
        ),
      ),
    );
    expect(dts).toContain(
      "complete: CompletePort<{ payload: string; }, { ok: boolean; }>;",
    );
  });

  it("Input generic defaults to any → input any (an untyped port); complete CompletePort<any, void>; error ErrorPort<any>", () => {
    const dts = buildPackageDts(
      extractPkg(
        ioPkg(
          "no-input-node",
          "NoInputNode",
          "{ c: 1 }",
          "async input(_msg: unknown) {}",
        ),
      ),
    );
    // Only the config generic is given, so Input defaults to `any` — which makes
    // an untyped input port (was previously treated as "no input").
    expect(dts).toContain("input: any;");
    expect(dts).toContain("complete: CompletePort<any, void>;");
    expect(dts).toContain("error: ErrorPort<any>;");
  });

  it("an always-throwing input() (inferred return never) → complete falls back to void, never `never`", () => {
    const dts = buildPackageDts(
      extractPkg(
        ioPkg(
          "throw-node",
          "ThrowNode",
          "{ c: 1 }, never, { payload: string }",
          `async input(_msg: { payload: string }) { throw new Error("boom"); }`,
        ),
      ),
    );
    // A `Promise<never>` return is vacuous → renderRole drops it → default "void".
    expect(dts).toContain(
      "complete: CompletePort<{ payload: string; }, void>;",
    );
    expect(dts).not.toMatch(/,\s*never\s*>/);
  });

  it("every IO node gets a StatusPort and an input-generic ErrorPort", () => {
    const dts = buildPackageDts(
      extractPkg(
        ioPkg(
          "st-node",
          "StNode",
          "{ c: 1 }, never, { payload: string }",
          "async input(_msg: { payload: string }) {}",
        ),
      ),
    );
    expect(dts).toContain("status: StatusPort;");
    expect(dts).toContain("error: ErrorPort<{ payload: string; }>;");
  });

  it("a config node gets no wiring-registry entry (config nodes have no ports)", () => {
    const dts = buildPackageDts(
      extractPkg({
        "cfg-node": `
          import { ConfigNode } from "@bonsae/nrg/server";
          export default class CfgNode extends ConfigNode<{ host: string }> {
            static readonly type = "cfg-node";
          }
        `,
      }),
    );
    expect(dts).toContain("export declare class CfgNode extends ConfigNode<");
    // Only IONodes are wired — a config node gets its class decl but no entry.
    expect(dts).not.toContain('"cfg-node": {');
    expect(dts).not.toContain("complete:");
    expect(dts).not.toContain("status:");
  });

  // Type-level: prove the semantics behind the string assertions — the standard
  // envelope is a real object type (so a void node's complete is NOT `never`),
  // and the input() return only adds the `output` field.
  const ENVELOPE_PKG = {
    "void-node": `
      import { IONode } from "@bonsae/nrg/server";
      export default class VoidNode extends IONode<{ c: 1 }, never, { payload: string }> {
        static readonly type = "void-node";
        async input(_msg: { payload: string }) {}
      }
    `,
    "return-node": `
      import { IONode } from "@bonsae/nrg/server";
      export default class ReturnNode extends IONode<{ c: 1 }, never, { payload: string }> {
        static readonly type = "return-node";
        async input(_msg: { payload: string }) { return { ok: true }; }
      }
    `,
  };

  it("a void node's complete is the assignable standard envelope (source + carried input), not never", () => {
    const dts = buildPackageDts(extractPkg(ENVELOPE_PKG));
    // If complete were `never`, this object literal would be unassignable.
    // `source` and `input` ride the root; a void return omits the `complete` key.
    // `_msgid` rides the message at runtime but is deliberately untyped, so the
    // envelope is exactly `{ source, input }`.
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       const c: NodeTypes["void-node"]["complete"] = {
         source: { id: "1", type: "void-node", name: undefined },
         input: { payload: "x" },
       };
       void c;`,
    );
    expect(diags).toHaveLength(0);
  });

  it("the input() return rides complete under `complete`; a void return has none", () => {
    const dts = buildPackageDts(extractPkg(ENVELOPE_PKG));
    const diags = compilePackage(
      dts,
      `import "acme-nodes";
       import type { NodeTypes } from "@bonsae/nrg/server";
       // return-node: input() returns { ok } → carried under \`complete\`.
       const out: { ok: boolean } =
         null as unknown as NodeTypes["return-node"]["complete"]["complete"];
       void out;
       // void-node: no return → no \`complete\` field (accessing it errors).
       // @ts-expect-error — a void-returning node's complete carries no value
       type _NoComplete = NodeTypes["void-node"]["complete"]["complete"];`,
    );
    expect(diags).toHaveLength(0);
  });
});
