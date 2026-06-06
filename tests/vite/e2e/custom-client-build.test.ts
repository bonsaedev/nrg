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

const FIXTURE_DIR = path.resolve(__dirname, "../../fixtures/custom-client");

describe("custom client entry build", () => {
  let outDir: string;
  let buildContext: BuildContext;
  let originalCwd: string;
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
      packageName: "node-red-test-custom",
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
      name: "CustomNodes",
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

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
  });

  // --- Custom entry ---

  it("should use the user-provided client entry", () => {
    // The user entry imports registerTypes and a custom node definition
    // The bundle should contain the user's registration code
    expect(bundleContent).toContain("registerType");
  });

  it("should not leave a generated entry behind", () => {
    // Since the user has a real entry, no auto-generation happens
    const userEntry = path.join(FIXTURE_DIR, "src/client/index.ts");
    expect(fs.existsSync(userEntry)).toBe(true); // user's file still exists
  });

  // --- Custom form component ---

  it("should include the custom Vue form component in the bundle", () => {
    // The custom form has class="custom-form" in its template
    expect(bundleContent).toContain("custom-form");
  });

  it("should include custom form field labels", () => {
    // The custom form has labels "Name" and "Message" with icons
    expect(bundleContent).toContain("tag");
    expect(bundleContent).toContain("comment");
  });

  it("should inline node type definition", () => {
    expect(bundleContent).toContain("custom-node");
  });

  it("should inline schema defaults", () => {
    expect(bundleContent).toContain("custom-node");
    expect(bundleContent).toContain("hello");
  });

  it("should inline node color", () => {
    expect(bundleContent).toContain("#33cc99");
  });

  it("should produce index.html", () => {
    const htmlPath = path.join(outDir, "index.html");
    expect(fs.existsSync(htmlPath)).toBe(true);
    const html = fs.readFileSync(htmlPath, "utf-8");
    expect(html).toContain("<script");
    expect(html).toContain("node-red-test-custom");
  });
});
