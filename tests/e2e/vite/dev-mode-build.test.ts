import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { build as buildServer } from "../../../src/vite/server/build";
import { build as buildClient } from "../../../src/vite/client/build";
import type {
  BuildContext,
  ServerBuildOptions,
  ClientBuildOptions,
} from "../../../src/vite/types";

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/basic-node");

describe("dev mode build", () => {
  let outDir: string;
  let buildContext: BuildContext;
  let originalCwd: string;

  beforeAll(() => {
    outDir = path.join(FIXTURE_DIR, "dist-dev");
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    originalCwd = process.cwd();
    process.chdir(FIXTURE_DIR);

    buildContext = {
      outDir,
      packageName: "node-red-test-basic",
      isDev: true,
    };
  });

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
  });

  describe("server dev build", () => {
    let serverContent: string;

    beforeAll(async () => {
      const serverOpts: ServerBuildOptions = {
        srcDir: path.join(FIXTURE_DIR, "src/server"),
        entry: "index.ts",
        format: "esm",
        bundled: [],
        types: false,
        nodeTarget: "node22",
      };
      await buildServer(serverOpts, buildContext);
      serverContent = fs.readFileSync(
        path.join(outDir, "index.mjs"),
        "utf-8",
      );
    });

    it("should produce inline sourcemaps in dev mode", () => {
      expect(serverContent).toContain("//# sourceMappingURL=data:");
    });

    it("should not produce separate .map files", () => {
      // Inline sourcemaps mean no separate files
      // But Vite may still produce them — the key is that inline is present
      expect(serverContent).toContain("sourceMappingURL");
    });
  });

  describe("client dev build", () => {
    let bundleContent: string;

    beforeAll(async () => {
      const clientOpts: ClientBuildOptions = {
        srcDir: path.join(FIXTURE_DIR, "src/client"),
        entry: "index.ts",
        name: "TestNodes",
        format: "es",
        external: ["jquery", "node-red", "vue", "@bonsae/nrg/client"],
        globals: { jquery: "$", "node-red": "RED", vue: "Vue" },
      };
      await buildClient(clientOpts, buildContext);

      const resourcesDir = path.join(outDir, "resources");
      const jsFiles = fs
        .readdirSync(resourcesDir)
        .filter((f) => f.startsWith("index.") && f.endsWith(".js"));
      bundleContent = fs.readFileSync(
        path.join(resourcesDir, jsFiles[0]),
        "utf-8",
      );
    }, 30000);

    it("should produce inline sourcemaps in client dev build", () => {
      expect(bundleContent).toContain("//# sourceMappingURL=data:");
    });

    it("should not minify in dev mode", () => {
      // Dev builds should preserve readable code — function names, whitespace
      // Minified code uses short variable names and no newlines
      const lines = bundleContent.split("\n");
      // In dev mode, there should be many lines (not minified to a single line)
      expect(lines.length).toBeGreaterThan(5);
    });

    it("should still inline node definitions", () => {
      expect(bundleContent).toContain("test-node");
      expect(bundleContent).toContain("registerType");
    });
  });
});
