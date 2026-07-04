import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import ts from "typescript";
import { extractNodeTypes } from "@/tools/vite/server/plugins/node-type-info";
import { buildPackageDts } from "@/tools/vite/server/plugins/node-types-dts";

// Proves the editor connection-checking works for REAL, non-trivial value types
// — streams and other named types, not just inline objects. A node OUTPUTS the
// type; another node's INPUT expects it; we extract both, build the package
// registry, then run tsc on a synthesized wire.
//
// The load-bearing part is that the generated .d.ts must reference these types
// SELF-CONTAINED. A dangling name (`Readable` with no import) silently collapses
// to `any` under skipLibCheck, and then EVERY wire to that port would falsely
// validate — so each type is checked both ways: a compatible wire connects and
// an incompatible wire is rejected.

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-stream-"));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;

// `ReadableStream` lives in the DOM lib; pin both programs to it so resolution
// is deterministic regardless of the host's default lib set.
const LIBS = ["lib.esnext.d.ts", "lib.dom.d.ts"];

/** Extract every node from a set of {relPath → source} files (real nrg types). */
function extractPkg(files: Record<string, string>) {
  const dir = path.join(TMP, `x-${counter++}`);
  const nodesDir = path.join(dir, "nodes");
  const roots = Object.entries(files).map(([name, src]) => {
    const f = path.join(nodesDir, `${name}.ts`);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, src);
    return f;
  });
  const program = ts.createProgram({
    rootNames: roots,
    options: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: LIBS,
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

/** Compile the generated .d.ts + a consumer wire against the real framework. */
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
      lib: LIBS,
      baseUrl: dir,
      paths: {
        "stream-nodes": [path.join(dir, "index.d.ts")],
        "@bonsae/nrg/server": [path.join(REPO, "src/sdk/lib/server/index.ts")],
        "@bonsae/nrg/schema": [
          path.join(REPO, "src/sdk/lib/shared/schemas/index.ts"),
        ],
      },
    },
  });
  // Ignore the real nrg source's own noise (checked under a stricter program
  // than the repo tsconfig); only the generated .d.ts / consumer count.
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.file && path.resolve(d.file.fileName).startsWith(dir));
}

/** A wire `source.outputs[0] → sink.input`, as the editor would synthesize it. */
function wire(source: string, sink: string): string {
  return `import "stream-nodes";
    import type { NodeTypes } from "@bonsae/nrg/server";
    const _: NodeTypes[${JSON.stringify(sink)}]["input"] =
      null as unknown as NodeTypes[${JSON.stringify(source)}]["outputs"][0];`;
}

const PKG: Record<string, string> = {
  // A local interface shared between two nodes — its declaration is NOT shipped
  // in the package, so the generated .d.ts must inline it structurally.
  "shared/frame": `export interface Frame { seq: number; bytes: Uint8Array }`,

  // Global stream type (Web Streams API) — resolves as a bare name.
  "web-source": `
    import { IONode } from "@bonsae/nrg/server";
    export default class WebSource extends IONode<{}, never, { go: boolean }, ReadableStream<Uint8Array>> {
      static readonly type = "web-source";
      async input(msg: { go: boolean }): Promise<ReadableStream<Uint8Array>> {
        return new ReadableStream<Uint8Array>();
      }
    }`,
  "web-sink": `
    import { IONode } from "@bonsae/nrg/server";
    export default class WebSink extends IONode<{}, never, ReadableStream<Uint8Array>, { n: number }> {
      static readonly type = "web-sink";
      async input(msg: ReadableStream<Uint8Array>): Promise<{ n: number }> { return { n: 0 }; }
    }`,

  // External package type (node builtin) — must keep the author's specifier.
  "node-source": `
    import { IONode } from "@bonsae/nrg/server";
    import { Readable } from "node:stream";
    export default class NodeSource extends IONode<{}, never, { go: boolean }, Readable> {
      static readonly type = "node-source";
      async input(msg: { go: boolean }): Promise<Readable> { return Readable.from([]); }
    }`,
  "node-sink": `
    import { IONode } from "@bonsae/nrg/server";
    import { Readable } from "node:stream";
    export default class NodeSink extends IONode<{}, never, Readable, { n: number }> {
      static readonly type = "node-sink";
      async input(msg: Readable): Promise<{ n: number }> { return { n: 0 }; }
    }`,

  // Local interface as the message type.
  "frame-source": `
    import { IONode } from "@bonsae/nrg/server";
    import type { Frame } from "./shared/frame";
    export default class FrameSource extends IONode<{}, never, { go: boolean }, Frame> {
      static readonly type = "frame-source";
      async input(msg: { go: boolean }): Promise<Frame> { return { seq: 0, bytes: new Uint8Array() }; }
    }`,
  "frame-sink": `
    import { IONode } from "@bonsae/nrg/server";
    import type { Frame } from "./shared/frame";
    export default class FrameSink extends IONode<{}, never, Frame, { ok: boolean }> {
      static readonly type = "frame-sink";
      async input(msg: Frame): Promise<{ ok: boolean }> { return { ok: true }; }
    }`,

  // A non-stream producer for the negative cases.
  "text-source": `
    import { IONode } from "@bonsae/nrg/server";
    export default class TextSource extends IONode<{}, never, { go: boolean }, { text: string }> {
      static readonly type = "text-source";
      async input(msg: { go: boolean }): Promise<{ text: string }> { return { text: "" }; }
    }`,
};

describe("named-type connection checking", () => {
  it("renders each named type self-contained in the registry", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    // global stream → bare name; node builtin → author's specifier;
    // local interface → inlined structure (never a dangling bare name).
    expect(dts).toMatch(/"web-source":[\s\S]*outputs: \[ReadableStream</);
    expect(dts).toMatch(
      /"node-source":[\s\S]*outputs: \[import\("node:stream"\)\.Readable\]/,
    );
    expect(dts).toMatch(/"frame-sink":[\s\S]*input: \{ seq: number; bytes:/);
    expect(dts).not.toContain("outputs: [Readable]"); // no dangling bare name
  });

  it("the generated .d.ts compiles clean against the framework", () => {
    const dts = buildPackageDts(extractPkg(PKG));
    expect(compilePackage(dts, `import "stream-nodes";\n`)).toHaveLength(0);
  });

  // Each type: a compatible wire connects, an incompatible wire is rejected.
  const CASES: Array<[string, string, string]> = [
    ["global Web stream", "web-source", "web-sink"],
    ["external node:stream", "node-source", "node-sink"],
    ["local interface", "frame-source", "frame-sink"],
  ];

  for (const [label, source, sink] of CASES) {
    it(`CONNECTS a matching ${label} wire`, () => {
      const dts = buildPackageDts(extractPkg(PKG));
      expect(compilePackage(dts, wire(source, sink))).toHaveLength(0);
    });

    it(`REJECTS a non-matching output at a ${label} input`, () => {
      const dts = buildPackageDts(extractPkg(PKG));
      // text-source emits { text: string } — not assignable to any of these.
      expect(
        compilePackage(dts, wire("text-source", sink)).length,
      ).toBeGreaterThan(0);
    });
  }
});
