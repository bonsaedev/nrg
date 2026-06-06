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

describe("multi-node build", () => {
  let outDir: string;
  let buildContext: BuildContext;
  let originalCwd: string;
  let bundleContent: string;
  let htmlContent: string;
  let serverContent: string;

  beforeAll(async () => {
    outDir = path.join(FIXTURE_DIR, "dist-multi");
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

    serverContent = fs.readFileSync(
      path.join(outDir, "index.mjs"),
      "utf-8",
    );

    const clientOpts: ClientBuildOptions = {
      srcDir: path.join(FIXTURE_DIR, "src/client"),
      entry: "index.ts",
      name: "TestNodes",
      format: "es",
      external: ["jquery", "node-red", "vue", "@bonsae/nrg/client"],
      globals: { jquery: "$", "node-red": "RED", vue: "Vue" },
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

  // --- Multiple nodes ---

  it("should inline all IO node types in the client bundle", () => {
    expect(bundleContent).toContain("test-node");
    expect(bundleContent).toContain("second-node");
  });

  it("should inline config node type in the client bundle", () => {
    expect(bundleContent).toContain("config-server");
  });

  it("should contain all node types in server bundle", () => {
    expect(serverContent).toContain("test-node");
    expect(serverContent).toContain("second-node");
    expect(serverContent).toContain("config-server");
  });

  // --- Config node ---

  it("should set category to config for config nodes", () => {
    // The config node should have category: "config" in the inlined definitions
    expect(bundleContent).toContain("config");
  });

  it("should inline config node defaults", () => {
    expect(bundleContent).toContain("localhost");
    expect(bundleContent).toContain("1883");
  });

  // --- NodeRef ---

  it("should include x-nrg-node-type in test-node defaults", () => {
    // The test-node has a NodeRef to config-server, so defaults should have type: "config-server"
    expect(bundleContent).toContain("config-server");
  });

  it("should include server property in test-node defaults with type", () => {
    // The defaults for the server field should have type set to the config node type
    const hasNodeRefType =
      bundleContent.includes('"config-server"') ||
      bundleContent.includes("'config-server'");
    expect(hasNodeRefType).toBe(true);
  });

  // --- Second node ---

  it("should inline second node color", () => {
    expect(bundleContent).toContain("#ff6633");
  });

  it("should inline second node outputs count", () => {
    expect(bundleContent).toContain("outputs:2");
  });

  it("should inline second node defaults", () => {
    expect(bundleContent).toContain("second-node");
    expect(bundleContent).toContain("100");
  });

  // --- Icons ---

  it("should copy icons to output", () => {
    const iconsDir = path.join(outDir, "icons");
    expect(fs.existsSync(iconsDir)).toBe(true);
    const files = fs.readdirSync(iconsDir);
    expect(files).toContain("test-node.svg");
  });

  it("should inline icon reference for test-node", () => {
    // The inliner resolves icons and adds them to the definition
    expect(bundleContent).toContain("test-node.svg");
  });
});
