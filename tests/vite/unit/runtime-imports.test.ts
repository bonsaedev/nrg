import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { rewriteEmittedRuntimeImports } from "@/vite/server/plugins/runtime-imports";

describe("rewriteEmittedRuntimeImports", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-runtime-rename-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("renames both toolkit specifiers to the runtime, leaving others untouched", () => {
    const code = [
      `import { IONode } from "@bonsae/nrg/server";`,
      `import { SchemaType } from '@bonsae/nrg/schema';`, // single quotes too
      `import { defineNode } from "@bonsae/nrg/client";`, // NOT rewritten
      `import jsforce from "jsforce";`, // third-party untouched
      `const s = "@bonsae/nrg/server is a string, still gets renamed by design";`,
    ].join("\n");
    fs.writeFileSync(path.join(dir, "index.mjs"), code);

    rewriteEmittedRuntimeImports(dir);

    const out = fs.readFileSync(path.join(dir, "index.mjs"), "utf-8");
    expect(out).toContain('from "@bonsae/nrg-runtime/server"');
    expect(out).toContain("from '@bonsae/nrg-runtime/schema'");
    expect(out).toContain('from "@bonsae/nrg/client"'); // untouched
    expect(out).toContain('from "jsforce"'); // untouched
    expect(out).not.toContain('"@bonsae/nrg/server"');
    expect(out).not.toContain("'@bonsae/nrg/schema'");
  });

  it("scans the output-dir root only (client build writes under resources/)", () => {
    const resources = path.join(dir, "resources");
    fs.mkdirSync(resources);
    const clientCode = `import { defineNode } from "@bonsae/nrg/server";`;
    fs.writeFileSync(path.join(resources, "client.js"), clientCode);
    fs.writeFileSync(
      path.join(dir, "index.mjs"),
      `import { IONode } from "@bonsae/nrg/server";`,
    );

    rewriteEmittedRuntimeImports(dir);

    // Root entry renamed…
    expect(fs.readFileSync(path.join(dir, "index.mjs"), "utf-8")).toContain(
      "@bonsae/nrg-runtime/server",
    );
    // …nested resources file left alone.
    expect(fs.readFileSync(path.join(resources, "client.js"), "utf-8")).toBe(
      clientCode,
    );
  });

  it("only rewrites .mjs/.cjs/.js files", () => {
    const dts = `import type { RED } from "@bonsae/nrg/server";`;
    fs.writeFileSync(path.join(dir, "index.d.ts"), dts);
    rewriteEmittedRuntimeImports(dir);
    expect(fs.readFileSync(path.join(dir, "index.d.ts"), "utf-8")).toBe(dts);
  });
});
