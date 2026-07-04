import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import ts from "typescript";
import { build } from "../../../src/tools/vite/server/build";
import type { ServerBuildOptions } from "../../../src/tools/vite/types";

// Guards the emitted package `index.d.ts` — the editor connection-type surface.
// It must carry (a) inheritable class declarations, (b) the `NodeTypes` wiring
// registry (module augmentation, with the built-in error/status ports), (c) a
// module default — and, above all, COMPILE CLEAN against the real framework, so
// the editor's synthesized wire type-checks against real shapes (a dangling
// reference would silently collapse to `any` and mis-validate every wire).

const REPO = path.resolve(__dirname, "../../..");
const BASIC_FIXTURE = path.resolve(__dirname, "../../fixtures/basic-node");
const CUSTOM_FIXTURE = path.resolve(__dirname, "../../fixtures/custom-client");

/**
 * Compile a generated `index.d.ts` against the real @bonsae/nrg/server (resolved
 * via paths) and return diagnostics in the .d.ts itself — proving every type it
 * references resolves (no dangling names collapsing to `any`).
 */
function compileDts(dtsPath: string): readonly ts.Diagnostic[] {
  const dir = path.dirname(dtsPath);
  const consumer = path.join(dir, "__compile_check.ts");
  fs.writeFileSync(consumer, `import "./index";\n`);
  const program = ts.createProgram({
    rootNames: [consumer],
    options: {
      strict: true,
      // skipLibCheck FALSE: we WANT unresolved names in the .d.ts to surface.
      skipLibCheck: false,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: dir,
      paths: {
        "@bonsae/nrg/server": [path.join(REPO, "src/sdk/lib/server/index.ts")],
        "@bonsae/nrg/schema": [
          path.join(REPO, "src/sdk/lib/shared/schemas/index.ts"),
        ],
      },
    },
  });
  // Only diagnostics in the generated .d.ts count — the real nrg source is
  // pulled in for resolution but type-checked under a stricter program than the
  // repo tsconfig (noImplicitAny), so ignore its own noise.
  const diags = ts
    .getPreEmitDiagnostics(program)
    .filter(
      (d) => d.file && path.resolve(d.file.fileName) === path.resolve(dtsPath),
    );
  fs.rmSync(consumer, { force: true });
  return diags;
}

async function buildFixture(
  fixture: string,
  packageName: string,
): Promise<string> {
  const outDir = path.join(fixture, "dist-types");
  if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(fixture);
  try {
    const opts: ServerBuildOptions = {
      srcDir: path.join(fixture, "src/server"),
      entry: "index.ts",
      format: "esm",
      bundled: [],
      types: true,
      nodeTarget: "node22",
    };
    await build(opts, {
      outDir,
      packageName,
      isDev: false,
      resourcesDir: path.join(fixture, "src/resources"),
    });
  } finally {
    process.chdir(originalCwd);
  }
  return path.join(outDir, "index.d.ts");
}

describe("type generation — class-based nodes", () => {
  let dtsPath: string;
  let dts: string;

  beforeAll(async () => {
    dtsPath = await buildFixture(BASIC_FIXTURE, "node-red-test-basic");
    dts = fs.readFileSync(dtsPath, "utf-8");
  }, 60000);

  afterAll(() => {
    const outDir = path.dirname(dtsPath);
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
  });

  it("emits index.d.ts", () => {
    expect(fs.existsSync(dtsPath)).toBe(true);
  });

  it("references the toolkit types, not the runtime (which ships no types)", () => {
    expect(dts).toContain("@bonsae/nrg/server");
    expect(dts).not.toContain("@bonsae/nrg-runtime");
  });

  it("emits inheritable class declarations for each node", () => {
    expect(dts).toContain("export declare class TestNode extends IONode<");
    expect(dts).toContain("export declare class SecondNode extends IONode<");
    expect(dts).toContain(
      "export declare class ConfigServer extends ConfigNode<",
    );
    expect(dts).toMatch(/static readonly type: "test-node"/);
  });

  it("emits the NodeTypes wiring registry with the built-in lifecycle ports", () => {
    expect(dts).toContain('declare module "@bonsae/nrg/server"');
    expect(dts).toContain("interface NodeTypes {");
    // IONode nodes get a registry entry; the config node does not.
    expect(dts).toContain('"test-node": {');
    expect(dts).toContain('"router-node": {');
    expect(dts).not.toContain('"config-server": {');
    expect(dts).toMatch(/error: ErrorPort;/);
    expect(dts).toMatch(/status: StatusPort;/);
  });

  it("emits a module default listing the node classes", () => {
    expect(dts).toContain("export default _default;");
    expect(dts).toMatch(/nodes: \[typeof \w/);
    expect(dts).toContain("typeof TestNode");
  });

  it("compiles clean against the framework (no dangling references)", () => {
    const diags = compileDts(dtsPath);
    if (diags.length) {
      throw new Error(
        diags
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
          .join("\n"),
      );
    }
    expect(diags).toHaveLength(0);
  });
});

describe("type generation — factory-based nodes", () => {
  let dtsPath: string;
  let dts: string;

  beforeAll(async () => {
    dtsPath = await buildFixture(CUSTOM_FIXTURE, "node-red-test-custom");
    dts = fs.readFileSync(dtsPath, "utf-8");
  }, 60000);

  afterAll(() => {
    const outDir = path.dirname(dtsPath);
    if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true });
  });

  it("emits index.d.ts", () => {
    expect(fs.existsSync(dtsPath)).toBe(true);
  });

  it("emits the NodeTypes registry for functional (defineIONode) nodes", () => {
    expect(dts).toContain('declare module "@bonsae/nrg/server"');
    expect(dts).toContain("interface NodeTypes {");
    expect(dts).toContain('"custom-node": {');
    expect(dts).toContain('"multi-output-node": {');
  });

  it("types the module default's functional nodes as NodeConstructor", () => {
    expect(dts).toContain("export default _default;");
    expect(dts).toContain("NodeConstructor");
  });

  it("compiles clean against the framework (no dangling references)", () => {
    const diags = compileDts(dtsPath);
    if (diags.length) {
      throw new Error(
        diags
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
          .join("\n"),
      );
    }
    expect(diags).toHaveLength(0);
  });
});
