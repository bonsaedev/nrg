import { describe, it, expect } from "vitest";
import { cjsWrapper, esmWrapper } from "@/tools/vite/server/plugins/output-wrapper";

describe("cjsWrapper", () => {
  const plugin = cjsWrapper();

  it("has correct name and no enforce property", () => {
    expect(plugin.name).toBe("vite-plugin-node-red:server:cjs-wrapper");
    expect((plugin as any).enforce).toBeUndefined();
  });

  it("returns null for non-entry chunk", () => {
    const chunk = { isEntry: false };
    const outputOptions = { format: "cjs" };
    const result = (plugin.renderChunk as Function).call(
      {},
      "some code",
      chunk,
      outputOptions,
    );
    expect(result).toBeNull();
  });

  it("returns null for non-cjs format", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "es" };
    const result = (plugin.renderChunk as Function).call(
      {},
      "some code",
      chunk,
      outputOptions,
    );
    expect(result).toBeNull();
  });

  it("appends footer to CJS entry chunk", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "cjs" };
    const code = "module.exports = { nodes: [] };";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    expect(result).not.toBeNull();
    expect(result.code).toContain(code);
    expect(result.code.indexOf(code)).toBe(0);
    expect(result.map).toBeNull();
  });

  it("footer requires registerTypes from the toolkit (renamed to runtime later)", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "cjs" };
    const code = "module.exports = { nodes: [] };";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    // The wrapper always injects the toolkit specifier (loadable at build time);
    // the production runtime rename is a separate final step.
    expect(result.code).toContain("registerTypes");
    expect(result.code).toContain('require("@bonsae/nrg/server")');
    expect(result.code).not.toContain("@bonsae/nrg-runtime");
  });
});

describe("esmWrapper", () => {
  const plugin = esmWrapper();

  it("has correct name and no enforce property", () => {
    expect(plugin.name).toBe("vite-plugin-node-red:server:esm-wrapper");
    expect((plugin as any).enforce).toBeUndefined();
  });

  it("returns null for non-entry chunk", () => {
    const chunk = { isEntry: false };
    const outputOptions = { format: "es" };
    const result = (plugin.renderChunk as Function).call(
      {},
      "export default foo;",
      chunk,
      outputOptions,
    );
    expect(result).toBeNull();
  });

  it("returns null for non-es format", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "cjs" };
    const result = (plugin.renderChunk as Function).call(
      {},
      "export default foo;",
      chunk,
      outputOptions,
    );
    expect(result).toBeNull();
  });

  it("returns null when no export pattern matches", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "es" };
    const code = "const x = 1;\nexport { x };";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    expect(result).toBeNull();
  });

  it("transforms 'export { X as default }' pattern", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "es" };
    const code = "const foo = { nodes: [] };\nexport { foo as default };";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    expect(result).not.toBeNull();
    expect(result.code).toContain("var __nrgExport = foo;");
    expect(result.code).toContain("__nrgRegisterTypes(__nrgExport.nodes)");
    expect(result.code).toContain("export { __nrgExport as default };");
    expect(result.code).not.toContain("export { foo as default }");
    expect(result.map).toBeNull();
  });

  it("transforms 'export default X' pattern", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "es" };
    const code = "const bar = { nodes: [] };\nexport default bar;";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    expect(result).not.toBeNull();
    expect(result.code).toContain("var __nrgExport = bar;");
    expect(result.code).toContain("__nrgRegisterTypes(__nrgExport.nodes)");
    expect(result.code).toContain("export { __nrgExport as default };");
    expect(result.code).not.toContain("export default bar");
    expect(result.map).toBeNull();
  });

  it("injects __dirname/__filename shims", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "es" };
    const code = "const myModule = {};\nexport default myModule;";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    expect(result).not.toBeNull();
    expect(result.code).toContain(
      'import { fileURLToPath as __nrgFileURLToPath } from "url";',
    );
    expect(result.code).toContain(
      'import { dirname as __nrgDirname } from "path";',
    );
    expect(result.code).toContain(
      "var __filename = __nrgFileURLToPath(import.meta.url);",
    );
    expect(result.code).toContain("var __dirname = __nrgDirname(__filename);");
  });

  it("imports registerTypes from the toolkit (renamed to runtime later)", () => {
    const chunk = { isEntry: true };
    const outputOptions = { format: "es" };
    const code = "const m = { nodes: [] };\nexport default m;";
    const result = (plugin.renderChunk as Function).call(
      {},
      code,
      chunk,
      outputOptions,
    );
    // Always the toolkit specifier (loadable at build time); the production
    // runtime rename is a separate final step.
    expect(result.code).toContain(
      'import { registerTypes as __nrgRegisterTypes } from "@bonsae/nrg/server";',
    );
    expect(result.code).not.toContain("@bonsae/nrg-runtime");
  });
});
