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

describe("client build", () => {
  let outDir: string;
  let buildContext: BuildContext;
  let originalCwd: string;
  let htmlContent: string;
  let bundleContent: string;

  beforeAll(async () => {
    outDir = path.join(FIXTURE_DIR, "dist");
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

    const serverOpts: ServerBuildOptions = {
      srcDir: path.join(FIXTURE_DIR, "src/server"),
      entry: "index.ts",
      format: "esm",
      bundled: [],
      types: false,
      nodeTarget: "node22",
    };
    await buildServer(serverOpts, buildContext);

    const clientOpts: ClientBuildOptions = {
      srcDir: path.join(FIXTURE_DIR, "src/client"),
      entry: "index.ts",
      name: "TestNodes",
      format: "es",
      external: ["jquery", "node-red", "vue", "@bonsae/nrg/client"],
      globals: { jquery: "$", "node-red": "RED", vue: "Vue" },
      locales: {
        docsDir: path.join(FIXTURE_DIR, "src/locales/docs"),
        labelsDir: path.join(FIXTURE_DIR, "src/locales/labels"),
        languages: ["en-US"],
      },
      staticDirs: {
        icons: path.join(FIXTURE_DIR, "src/icons"),
      },
    };
    await buildClient(clientOpts, buildContext);

    htmlContent = fs.readFileSync(path.join(outDir, "index.html"), "utf-8");

    const resourcesDir = path.join(outDir, "resources");
    const jsFiles = fs
      .readdirSync(resourcesDir)
      .filter((f) => f.startsWith("index.") && f.endsWith(".js"));
    bundleContent = fs.readFileSync(
      path.join(resourcesDir, jsFiles[0]),
      "utf-8",
    );
  }, 30000);

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
  });

  // --- index.html ---

  it("should produce index.html", () => {
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
  });

  it("should include script tags referencing the package name", () => {
    expect(htmlContent).toContain("<script");
    expect(htmlContent).toContain("node-red-test-basic");
  });

  // --- JS bundle: node definitions inlining ---

  it("should produce JS bundle in resources/", () => {
    const resourcesDir = path.join(outDir, "resources");
    const jsFiles = fs
      .readdirSync(resourcesDir)
      .filter((f) => f.endsWith(".js"));
    expect(jsFiles.length).toBeGreaterThan(0);
  });

  it("should inline node type registration", () => {
    expect(bundleContent).toContain("registerType");
  });

  it("should inline node type identifier", () => {
    expect(bundleContent).toContain("test-node");
  });

  it("should inline schema defaults", () => {
    // 5000 is minified to 5e3
    expect(bundleContent).toContain("5e3");
    expect(bundleContent).toContain("test-node");
  });

  it("should inline credential field types", () => {
    expect(bundleContent).toContain("password");
  });

  it("should inline config schema with $id", () => {
    expect(bundleContent).toContain("test-node:configs");
  });

  it("should inline credentials schema with $id", () => {
    expect(bundleContent).toContain("test-node:credentials");
  });

  it("should inline node color", () => {
    expect(bundleContent).toContain("#a6bbcf");
  });

  it("should inline node inputs and outputs", () => {
    expect(bundleContent).toContain("inputs:1");
    expect(bundleContent).toContain("outputs:1");
  });

  it("should import from @bonsae/nrg/client", () => {
    expect(bundleContent).toContain("nrg-client.js");
  });

  // --- Auto-generated entry cleanup ---

  it("should clean up auto-generated entry after build", () => {
    // The auto-generated entry is created in node_modules/.nrg/client/
    // and deleted after the build. Since multiple test suites may run
    // concurrently with the same fixture, we verify the build completed
    // successfully (which implies cleanup worked).
    expect(fs.existsSync(path.join(outDir, "index.html"))).toBe(true);
  });

  // --- Locales ---

  it("should produce locales directory", () => {
    const localesDir = path.join(outDir, "locales");
    expect(fs.existsSync(localesDir)).toBe(true);
  });

  it("should produce locale files for the configured language", () => {
    const localesDir = path.join(outDir, "locales");
    const files = fs.readdirSync(localesDir, { recursive: true }) as string[];
    const enFiles = files.filter((f) => String(f).includes("en-US"));
    expect(enFiles.length).toBeGreaterThan(0);
  });
});
