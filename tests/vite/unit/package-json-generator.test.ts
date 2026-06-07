import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  packageJsonGenerator,
  buildTypesPath,
  buildOutputPath,
  buildExportKey,
  buildEsmOutputPath,
  generateExports,
  patchExportsWithTypes,
} from "@/vite/server/plugins/package-json-generator";

describe("buildTypesPath", () => {
  it("returns ./name.d.ts", () => {
    expect(buildTypesPath("index")).toBe("./index.d.ts");
    expect(buildTypesPath("server")).toBe("./server.d.ts");
  });
});

describe("buildOutputPath", () => {
  it("returns ./name.js", () => {
    expect(buildOutputPath("index")).toBe("./index.js");
    expect(buildOutputPath("utils")).toBe("./utils.js");
  });
});

describe("buildExportKey", () => {
  it('returns "." for "index"', () => {
    expect(buildExportKey("index")).toBe(".");
  });

  it("returns ./name otherwise", () => {
    expect(buildExportKey("server")).toBe("./server");
    expect(buildExportKey("client")).toBe("./client");
  });
});

describe("buildEsmOutputPath", () => {
  it("returns ./name.mjs", () => {
    expect(buildEsmOutputPath("index")).toBe("./index.mjs");
    expect(buildEsmOutputPath("helpers")).toBe("./helpers.mjs");
  });
});

describe("generateExports", () => {
  it("CJS format does not have import key", () => {
    const result = generateExports(["index"], "cjs");
    const entry = result["."] as Record<string, string>;
    expect(entry).not.toHaveProperty("import");
    expect(entry.types).toBe("./index.d.ts");
    expect(entry.require).toBe("./index.js");
    expect(entry.default).toBe("./index.js");
  });

  it("ESM format has import key", () => {
    const result = generateExports(["index"], "esm");
    const entry = result["."] as Record<string, string>;
    expect(entry.import).toBe("./index.mjs");
    expect(entry.types).toBe("./index.d.ts");
    expect(entry.require).toBe("./index.js");
    expect(entry.default).toBe("./index.js");
  });

  it("handles multiple entries including index", () => {
    const result = generateExports(["index", "server", "client"], "cjs");
    expect(result).toHaveProperty(".");
    expect(result).toHaveProperty("./server");
    expect(result).toHaveProperty("./client");

    const indexEntry = result["."] as Record<string, string>;
    expect(indexEntry.require).toBe("./index.js");

    const serverEntry = result["./server"] as Record<string, string>;
    expect(serverEntry.types).toBe("./server.d.ts");
    expect(serverEntry.require).toBe("./server.js");
  });
});

describe("patchExportsWithTypes", () => {
  it("patches string values to objects with types", () => {
    const existing = { ".": "./index.js" };
    const result = patchExportsWithTypes(existing, ["index"]);
    expect(result["."]).toEqual({
      types: "./index.d.ts",
      require: "./index.js",
      default: "./index.js",
    });
  });

  it("patches objects without types", () => {
    const existing = {
      ".": { require: "./index.js", default: "./index.js" },
    };
    const result = patchExportsWithTypes(existing, ["index"]);
    const entry = result["."] as Record<string, string>;
    expect(entry.types).toBe("./index.d.ts");
    expect(entry.require).toBe("./index.js");
    expect(entry.default).toBe("./index.js");
  });

  it("skips entries not in entryNames", () => {
    const existing = {
      ".": "./index.js",
      "./other": "./other.js",
    };
    const result = patchExportsWithTypes(existing, ["index"]);
    expect(result["."]).toEqual({
      types: "./index.d.ts",
      require: "./index.js",
      default: "./index.js",
    });
    // ./other is not in entryNames, so stays as-is
    expect(result["./other"]).toBe("./other.js");
  });

  it("skips objects that already have types", () => {
    const existing = {
      ".": {
        types: "./custom.d.ts",
        require: "./index.js",
        default: "./index.js",
      },
    };
    const result = patchExportsWithTypes(existing, ["index"]);
    const entry = result["."] as Record<string, string>;
    expect(entry.types).toBe("./custom.d.ts");
  });
});

describe("packageJsonGenerator plugin", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-pkg-gen-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("has correct name and enforce property", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    expect(plugin.name).toBe(
      "vite-plugin-node-red:server:package-json-generator",
    );
    expect(plugin.enforce).toBe("pre");
  });

  it("resolveId marks node builtins as external", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    const resolveId = (plugin.resolveId as any).handler;
    const result = resolveId("fs", "/some/importer.ts");
    expect(result).toEqual({ id: "fs", external: true });
  });

  it("resolveId marks node: prefixed builtins as external", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    const resolveId = (plugin.resolveId as any).handler;
    const result = resolveId("node:path", "/some/importer.ts");
    expect(result).toEqual({ id: "node:path", external: true });
  });

  it("resolveId marks non-bundled packages as external", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir, bundled: [] });
    const resolveId = (plugin.resolveId as any).handler;
    const result = resolveId("express", "/some/importer.ts");
    expect(result).toEqual({ id: "express", external: true });
  });

  it("resolveId returns null for relative imports", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    const resolveId = (plugin.resolveId as any).handler;
    expect(resolveId("./utils", "/some/importer.ts")).toBeNull();
    expect(resolveId("../lib/foo", "/some/importer.ts")).toBeNull();
  });

  it("resolveId returns null for absolute path imports", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    const resolveId = (plugin.resolveId as any).handler;
    expect(resolveId("/absolute/path", "/some/importer.ts")).toBeNull();
  });

  it("resolveId returns null for bundled packages", () => {
    const plugin = packageJsonGenerator({
      outDir: tmpDir,
      bundled: ["lodash"],
    });
    const resolveId = (plugin.resolveId as any).handler;
    expect(resolveId("lodash", "/some/importer.ts")).toBeNull();
    expect(resolveId("lodash/merge", "/some/importer.ts")).toBeNull();
  });

  it("resolveId returns null when no importer", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    const resolveId = (plugin.resolveId as any).handler;
    expect(resolveId("express", undefined)).toBeNull();
  });

  it("resolveId handles scoped packages correctly", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir, bundled: [] });
    const resolveId = (plugin.resolveId as any).handler;
    const result = resolveId(
      "@bonsae/nrg/server",
      "/some/importer.ts",
    );
    expect(result).toEqual({ id: "@bonsae/nrg/server", external: true });
  });

  it("buildStart clears tracked dependencies", () => {
    const plugin = packageJsonGenerator({ outDir: tmpDir });
    const resolveId = (plugin.resolveId as any).handler;
    resolveId("express", "/importer.ts");
    (plugin as any).buildStart();
    // After clear, closeBundle should produce no dependencies
    const pkgDir = path.join(tmpDir, "cwd");
    fs.mkdirSync(pkgDir, { recursive: true });
    fs.writeFileSync(
      path.join(pkgDir, "package.json"),
      JSON.stringify({ name: "test", version: "1.0.0" }),
    );
    const outDir2 = path.join(tmpDir, "out");
    const origCwd = process.cwd();
    vi.spyOn(process, "cwd").mockReturnValue(pkgDir);
    try {
      (plugin as any).closeBundle();
    } finally {
      vi.restoreAllMocks();
      process.chdir(origCwd);
    }
    // Should have written package.json without dependencies
    const written = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "package.json"), "utf-8"),
    );
    expect(written.dependencies).toBeUndefined();
  });
});

describe("packageJsonGenerator closeBundle", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-pkg-close-"));
    origCwd = process.cwd();
    vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePackageJson(content: Record<string, unknown>) {
    fs.writeFileSync(
      path.join(tmpDir, "package.json"),
      JSON.stringify(content),
    );
  }

  it("generates package.json with correct structure", () => {
    writePackageJson({
      name: "my-node",
      version: "1.0.0",
      description: "test",
      scripts: { build: "vite" },
      devDependencies: { vitest: "^1.0.0" },
    });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.name).toBe("my-node");
    expect(result.version).toBe("1.0.0");
    expect(result.main).toBe("index.js");
    expect(result.type).toBe("commonjs");
    expect(result.scripts).toBeUndefined();
    expect(result.devDependencies).toBeUndefined();
    expect(result["node-red"]).toEqual({ nodes: { nodes: "index.js" } });
    expect(result.keywords).toContain("node-red");
  });

  it("tracks dependencies from resolveId", () => {
    writePackageJson({
      name: "test",
      version: "1.0.0",
      dependencies: { express: "^4.18.0", lodash: "^4.17.0" },
    });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    const resolveId = (plugin.resolveId as any).handler;
    resolveId("express", "/importer.ts");
    resolveId("lodash/merge", "/importer.ts");
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.dependencies).toEqual({
      express: "^4.18.0",
      lodash: "^4.17.0",
    });
  });

  it("skips peer dependencies", () => {
    writePackageJson({
      name: "test",
      version: "1.0.0",
      dependencies: { axios: "^1.0.0" },
      peerDependencies: { "node-red": ">=3.0.0" },
    });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    const resolveId = (plugin.resolveId as any).handler;
    resolveId("axios", "/importer.ts");
    resolveId("node-red", "/importer.ts");
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.dependencies).toEqual({ axios: "^1.0.0" });
  });

  it("reads dependency version from node_modules when not in source deps", () => {
    writePackageJson({ name: "test", version: "1.0.0" });
    const depDir = path.join(tmpDir, "node_modules", "some-lib");
    fs.mkdirSync(depDir, { recursive: true });
    fs.writeFileSync(
      path.join(depDir, "package.json"),
      JSON.stringify({ name: "some-lib", version: "2.3.4" }),
    );
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    const resolveId = (plugin.resolveId as any).handler;
    resolveId("some-lib", "/importer.ts");
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.dependencies).toEqual({ "some-lib": "^2.3.4" });
  });

  it("sets dependencies to undefined when none tracked", () => {
    writePackageJson({ name: "test", version: "1.0.0" });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.dependencies).toBeUndefined();
  });

  it("generates exports when types=true", () => {
    writePackageJson({ name: "test", version: "1.0.0" });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({
      outDir,
      types: true,
      entryNames: ["index", "server"],
      format: "esm",
    });
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.exports["."]).toBeDefined();
    expect(result.exports["./server"]).toBeDefined();
    expect((result.exports["."] as any).types).toBe("./index.d.ts");
    expect((result.exports["."] as any).import).toBe("./index.mjs");
    expect(result.types).toBe("index.d.ts");
  });

  it("patches existing user exports when types=true and exports exist", () => {
    writePackageJson({
      name: "test",
      version: "1.0.0",
      exports: { ".": "./index.js", "./server": "./server.js" },
    });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({
      outDir,
      types: true,
      entryNames: ["index", "server"],
    });
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect((result.exports["."] as any).types).toBe("./index.d.ts");
    expect((result.exports["./server"] as any).types).toBe("./server.d.ts");
  });

  it("warns and returns when package.json not found", () => {
    // Don't write package.json — cwd has no package.json
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    // Should not throw
    expect(() => (plugin as any).closeBundle()).not.toThrow();
    expect(fs.existsSync(path.join(outDir, "package.json"))).toBe(false);
  });

  it("preserves existing keywords with deduplication", () => {
    writePackageJson({
      name: "test",
      version: "1.0.0",
      keywords: ["iot", "node-red"],
    });
    const outDir = path.join(tmpDir, "dist");
    const plugin = packageJsonGenerator({ outDir });
    (plugin as any).closeBundle();

    const result = JSON.parse(
      fs.readFileSync(path.join(outDir, "package.json"), "utf-8"),
    );
    expect(result.keywords).toEqual(["iot", "node-red"]);
  });
});
