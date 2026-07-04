import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import ts from "typescript";

// Demo/proof for the cross-package editor connection-checking design: each nrg
// package AUGMENTS a shared `NodeTypes` registry declared by @bonsae/nrg/server,
// so after two packages are "installed" the editor can look up ANY node's port
// types from one merged interface and type-check a wire — including the built-in
// lifecycle ports (error / complete / status), which also connect to inputs.

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-xpkg-"));

function write(rel: string, content: string) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

beforeAll(() => {
  // --- the framework: declares the shared registry + the built-in port types ---
  write(
    "node_modules/@bonsae/nrg/package.json",
    JSON.stringify({
      name: "@bonsae/nrg",
      version: "1.0.0",
      exports: { "./server": { types: "./server.d.ts" } },
    }),
  );
  write(
    "node_modules/@bonsae/nrg/server.d.ts",
    `
    export interface NodeSource { id: string; type: string; name: string; }
    // Built-in lifecycle port message shapes (same for every node).
    export interface ErrorPort { error: { name: string; message: string; source: NodeSource } }
    export interface StatusPort { status: { fill?: string; text?: string } | string; source: NodeSource }
    // The base registry each package augments (keyed by node-type string).
    export interface NodeTypes {}
    `,
  );

  // --- package A: a producer node, augments the registry ---
  write(
    "node_modules/pkg-a/package.json",
    JSON.stringify({ name: "pkg-a", version: "1.0.0", types: "index.d.ts" }),
  );
  write(
    "node_modules/pkg-a/index.d.ts",
    `
    import type { NodeSource, ErrorPort, StatusPort } from "@bonsae/nrg/server";
    declare module "@bonsae/nrg/server" {
      interface NodeTypes {
        "a-producer": {
          input: { text: string };
          outputs: [{ payload: string }];
          complete: { done: boolean };
          error: ErrorPort;
          status: StatusPort;
        };
      }
    }
    `,
  );

  // --- package B: consumer + specialized handlers, augments the same registry ---
  write(
    "node_modules/pkg-b/package.json",
    JSON.stringify({ name: "pkg-b", version: "1.0.0", types: "index.d.ts" }),
  );
  write(
    "node_modules/pkg-b/index.d.ts",
    `
    import type { ErrorPort, StatusPort } from "@bonsae/nrg/server";
    declare module "@bonsae/nrg/server" {
      interface NodeTypes {
        "b-consumer":         { input: { payload: string };  outputs: []; complete: never; error: ErrorPort; status: never };
        "b-complete-handler": { input: { done: boolean };    outputs: []; complete: never; error: ErrorPort; status: never };
        "b-error-handler":    { input: ErrorPort;            outputs: []; complete: never; error: ErrorPort; status: never };
        "b-status-handler":   { input: StatusPort;           outputs: []; complete: never; error: ErrorPort; status: never };
      }
    }
    `,
  );
});

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

/** Type-check `body` in a program that "installs" both packages. */
function tscCheck(body: string): readonly ts.Diagnostic[] {
  const dir = path.join(ROOT, `check-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "check.ts");
  fs.writeFileSync(
    file,
    `import "pkg-a";\nimport "pkg-b";\nimport type { NodeTypes } from "@bonsae/nrg/server";\n${body}\n`,
  );
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      baseUrl: ROOT,
    },
  });
  return ts.getPreEmitDiagnostics(program);
}

describe("cross-package NodeTypes augmentation", () => {
  it("merges two installed packages into one registry (sanity)", () => {
    // Referencing a node from EACH package resolves — proves the augmentations
    // from pkg-a and pkg-b merged into the single NodeTypes interface.
    expect(
      tscCheck(`
        type A = NodeTypes["a-producer"]["outputs"][0];
        type B = NodeTypes["b-consumer"]["input"];
      `),
    ).toHaveLength(0);
  });

  it("type-checks a COMPATIBLE cross-package base wire", () => {
    // pkg-a a-producer port 0 ({payload:string}) → pkg-b b-consumer input.
    expect(
      tscCheck(
        `const _: NodeTypes["b-consumer"]["input"] = null as unknown as NodeTypes["a-producer"]["outputs"][0];`,
      ),
    ).toHaveLength(0);
  });

  it("flags an INCOMPATIBLE cross-package base wire", () => {
    // a-producer base output ({payload:string}) → b-error-handler input (ErrorPort) — not connectable.
    expect(
      tscCheck(
        `const _: NodeTypes["b-error-handler"]["input"] = null as unknown as NodeTypes["a-producer"]["outputs"][0];`,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("type-checks the COMPLETE lifecycle port into a matching input", () => {
    // a-producer complete port ({done:boolean}) → b-complete-handler input.
    expect(
      tscCheck(
        `const _: NodeTypes["b-complete-handler"]["input"] = null as unknown as NodeTypes["a-producer"]["complete"];`,
      ),
    ).toHaveLength(0);
    // …but not into b-consumer (wants {payload:string}).
    expect(
      tscCheck(
        `const _: NodeTypes["b-consumer"]["input"] = null as unknown as NodeTypes["a-producer"]["complete"];`,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("type-checks the ERROR lifecycle port into an error-handler input", () => {
    // a-producer error port → b-error-handler input (both ErrorPort) — connectable.
    expect(
      tscCheck(
        `const _: NodeTypes["b-error-handler"]["input"] = null as unknown as NodeTypes["a-producer"]["error"];`,
      ),
    ).toHaveLength(0);
    // …but the error port is NOT connectable to b-consumer's {payload:string} input.
    expect(
      tscCheck(
        `const _: NodeTypes["b-consumer"]["input"] = null as unknown as NodeTypes["a-producer"]["error"];`,
      ).length,
    ).toBeGreaterThan(0);
  });

  it("type-checks the STATUS lifecycle port into a status-handler input", () => {
    // a-producer status port → b-status-handler input (both StatusPort) — connectable.
    expect(
      tscCheck(
        `const _: NodeTypes["b-status-handler"]["input"] = null as unknown as NodeTypes["a-producer"]["status"];`,
      ),
    ).toHaveLength(0);
    // …but not into b-error-handler (wants ErrorPort).
    expect(
      tscCheck(
        `const _: NodeTypes["b-error-handler"]["input"] = null as unknown as NodeTypes["a-producer"]["status"];`,
      ).length,
    ).toBeGreaterThan(0);
  });
});
