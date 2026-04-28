import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { build } from "../../../src/vite/server/build";
import type { BuildContext, ServerBuildOptions } from "../../../src/vite/types";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/basic-node");

describe("server build", () => {
  let outDir: string;
  let buildContext: BuildContext;
  let originalCwd: string;

  beforeAll(() => {
    outDir = path.join(FIXTURE_DIR, "dist-server");
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    originalCwd = process.cwd();
    process.chdir(FIXTURE_DIR);

    buildContext = {
      outDir,
      packageName: "node-red-test-basic",
      isDev: false,
    };
  });

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
  });

  describe("ESM format", () => {
    let esmOutDir: string;
    let bundleContent: string;

    beforeAll(async () => {
      esmOutDir = path.join(outDir, "esm");
      fs.mkdirSync(esmOutDir, { recursive: true });

      const opts: ServerBuildOptions = {
        srcDir: path.join(FIXTURE_DIR, "src/server"),
        entry: "index.ts",
        format: "esm",
        bundled: [],
        types: false,
        nodeTarget: "node22",
      };

      await build(opts, { ...buildContext, outDir: esmOutDir });
      bundleContent = fs.readFileSync(
        path.join(esmOutDir, "index.mjs"),
        "utf-8",
      );
    });

    it("should produce index.mjs", () => {
      expect(fs.existsSync(path.join(esmOutDir, "index.mjs"))).toBe(true);
    });

    it("should produce CJS bridge index.js", () => {
      const bridgePath = path.join(esmOutDir, "index.js");
      expect(fs.existsSync(bridgePath)).toBe(true);
      const content = fs.readFileSync(bridgePath, "utf-8");
      expect(content).toContain("module.exports");
      expect(content).toContain("import(");
      expect(content).toContain("index.mjs");
    });

    it("should produce package.json with node-red manifest", () => {
      const pkgPath = path.join(esmOutDir, "package.json");
      expect(fs.existsSync(pkgPath)).toBe(true);
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      expect(pkg["node-red"]).toBeDefined();
      expect(pkg["node-red"].nodes).toBeDefined();
      expect(pkg.keywords).toContain("node-red");
      expect(pkg.type).toBe("commonjs");
    });

    it("should contain the node type identifier", () => {
      expect(bundleContent).toContain("test-node");
    });

    it("should inject registerTypes from ESM wrapper", () => {
      expect(bundleContent).toContain("registerTypes");
    });

    it("should inject __dirname and __filename shims", () => {
      expect(bundleContent).toContain("fileURLToPath");
      expect(bundleContent).toContain("dirname");
    });

    it("should externalize @bonsae/nrg/server", () => {
      expect(bundleContent).toContain("@bonsae/nrg/server");
    });

    it("should contain the node class definition", () => {
      // The class should have type, category, color, inputs, outputs
      expect(bundleContent).toContain("function");
      expect(bundleContent).toContain("#a6bbcf");
    });

    it("should contain schema default values", () => {
      expect(bundleContent).toContain("test-node");
      // 5000 may be minified to 5e3
      expect(
        bundleContent.includes("5000") || bundleContent.includes("5e3"),
      ).toBe(true);
    });
  });

  describe("CJS format", () => {
    let cjsOutDir: string;
    let bundleContent: string;

    beforeAll(async () => {
      cjsOutDir = path.join(outDir, "cjs");
      fs.mkdirSync(cjsOutDir, { recursive: true });

      const opts: ServerBuildOptions = {
        srcDir: path.join(FIXTURE_DIR, "src/server"),
        entry: "index.ts",
        format: "cjs",
        bundled: [],
        types: false,
        nodeTarget: "node22",
      };

      await build(opts, { ...buildContext, outDir: cjsOutDir });
      bundleContent = fs.readFileSync(
        path.join(cjsOutDir, "index.js"),
        "utf-8",
      );
    });

    it("should produce index.js (CJS)", () => {
      expect(fs.existsSync(path.join(cjsOutDir, "index.js"))).toBe(true);
    });

    it("should not produce index.mjs", () => {
      expect(fs.existsSync(path.join(cjsOutDir, "index.mjs"))).toBe(false);
    });

    it("should produce package.json", () => {
      expect(fs.existsSync(path.join(cjsOutDir, "package.json"))).toBe(true);
    });

    it("should inject registerTypes from CJS wrapper", () => {
      expect(bundleContent).toContain("registerTypes");
    });

    it("should contain the node type identifier", () => {
      expect(bundleContent).toContain("test-node");
    });
  });
});
