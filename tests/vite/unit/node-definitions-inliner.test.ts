import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { parseAst } from "vite";
import { nodeDefinitionsInliner } from "@/vite/client/plugins/node-definitions-inliner";
import { nodeDefsPath } from "@/vite/utils";
import { logger } from "@/vite/logger";

// The wrap transform bakes each node's server-extracted schema (and convention
// form) onto its own `defineNode({ type })` call at build time — keyed by the
// LITERAL `type`, never the filename — so there is no runtime schema/form
// registry. These tests exercise that transform directly with vite's parseAst
// as the Rollup `this.parse`.

const DEFS = {
  nodeTypes: ["known-node", "form-node"],
  definitions: {
    "known-node": {
      defaults: { name: { value: "" } },
      category: "server-cat",
      color: "#111111",
    },
    "form-node": { defaults: {} },
  },
};

let tmpDirs: string[] = [];

function mkTmp(prefix: string): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(d);
  return d;
}

function makePlugins(componentsDir?: string) {
  const serverOutDir = mkTmp("nrg-inliner-out-");
  const cacheDir = mkTmp("nrg-inliner-cache-");
  const defsPath = nodeDefsPath(serverOutDir);
  tmpDirs.push(path.dirname(defsPath));
  fs.mkdirSync(path.dirname(defsPath), { recursive: true });
  fs.writeFileSync(defsPath, JSON.stringify(DEFS));

  const [setup, wrap] = nodeDefinitionsInliner(
    serverOutDir,
    "/proj/src/client/index.ts",
    undefined,
    componentsDir,
    undefined,
    true,
    cacheDir,
  );
  (setup as any).buildStart.call({});
  return { setup, wrap, cacheDir };
}

const schemaImport = (cacheDir: string, type: string) =>
  path.join(cacheDir, "schemas", `${type}.ts`);

function transform(
  wrap: any,
  code: string,
  id = "/proj/src/client/nodes/example.ts",
): { code: string; map: null } | undefined {
  return wrap.transform.call({ parse: parseAst }, code, id);
}

describe("node-definitions-inliner: schema-wrap transform", () => {
  beforeEach(() => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
    tmpDirs = [];
  });

  it("wraps a known defineNode call with its per-type schema, def spread last", () => {
    const { wrap, cacheDir } = makePlugins();
    const out = transform(
      wrap,
      `import { defineNode } from "@bonsae/nrg/client";\nexport default defineNode({ type: "known-node", category: "function" });`,
    );
    expect(out).toBeTruthy();
    const code = out!.code;
    // The written per-type schema file exists and is imported by absolute path.
    expect(fs.existsSync(schemaImport(cacheDir, "known-node"))).toBe(true);
    expect(code).toContain(
      `import __nrgSchema_known_node from ${JSON.stringify(schemaImport(cacheDir, "known-node"))};`,
    );
    expect(code).toContain("...__nrgSchema_known_node");
    expect(code).toContain(`...defineNode({ type: "known-node"`);
    // Def is spread AFTER the schema — so the definition wins on conflicting
    // keys (this is the precedence the old registerType merge used to enforce).
    expect(code.indexOf("...__nrgSchema_known_node")).toBeLessThan(
      code.indexOf("...defineNode"),
    );
  });

  it("keys injection on the literal type, not the filename", () => {
    const { wrap, cacheDir } = makePlugins();
    // File basename `example` differs from the declared type `known-node`
    // (the smoke-consumer layout). Injection must still happen, by type.
    const out = transform(
      wrap,
      `import { defineNode } from "@bonsae/nrg/client";\nexport default defineNode({ type: "known-node" });`,
      "/proj/src/client/nodes/example.ts",
    );
    expect(out?.code).toContain(schemaImport(cacheDir, "known-node"));
  });

  it("injects the convention form when {type}.vue exists", () => {
    const componentsDir = mkTmp("nrg-inliner-cmp-");
    fs.writeFileSync(
      path.join(componentsDir, "form-node.vue"),
      "<template><div/></template>",
    );
    const { wrap } = makePlugins(componentsDir);
    const out = transform(wrap, `defineNode({ type: "form-node" });`);
    const code = out!.code;
    expect(code).toContain(
      `import __nrgForm_form_node from ${JSON.stringify(path.join(componentsDir, "form-node.vue"))};`,
    );
    // form sits between the schema and the def, so an author-declared `form:`
    // inside defineNode (spread last) still overrides the convention form.
    expect(
      code.indexOf("form: { component: __nrgForm_form_node }"),
    ).toBeLessThan(code.indexOf("...defineNode"));
  });

  it("wraps every inline defineNode call (multiple per file)", () => {
    const { wrap, cacheDir } = makePlugins();
    const out = transform(
      wrap,
      `import { defineNode, registerTypes } from "@bonsae/nrg/client";\nregisterTypes([defineNode({ type: "known-node" }), defineNode({ type: "form-node" })]);`,
      "/proj/src/client/index.ts",
    );
    const code = out!.code;
    expect(code).toContain(schemaImport(cacheDir, "known-node"));
    expect(code).toContain(schemaImport(cacheDir, "form-node"));
    expect(code).toContain("...__nrgSchema_known_node");
    expect(code).toContain("...__nrgSchema_form_node");
  });

  it("warns and skips a type with no server-extracted schema", () => {
    const { wrap } = makePlugins();
    const out = transform(wrap, `defineNode({ type: "ghost-node" });`);
    expect(out).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`node type "ghost-node" has no server-extracted`),
    );
  });

  it("warns and skips a non-literal (computed) type", () => {
    const { wrap } = makePlugins();
    const out = transform(
      wrap,
      `const T = "known-node";\nexport default defineNode({ type: T });`,
    );
    expect(out).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("non-literal `type`"),
    );
  });

  it("ignores files without a defineNode call", () => {
    const { wrap } = makePlugins();
    expect(transform(wrap, `export const x = 1;`)).toBeUndefined();
  });

  it("ignores node_modules files", () => {
    const { wrap } = makePlugins();
    expect(
      transform(
        wrap,
        `defineNode({ type: "known-node" });`,
        "/proj/node_modules/pkg/index.ts",
      ),
    ).toBeUndefined();
  });
});
