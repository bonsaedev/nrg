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
