import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { build } from "../../../src/vite/server/build";
import type { ServerBuildOptions } from "../../../src/vite/types";

const BASIC_FIXTURE = path.resolve(__dirname, "../../fixtures/basic-node");
const CUSTOM_FIXTURE = path.resolve(__dirname, "../../fixtures/custom-client");

describe("type generation — class-based nodes", () => {
  let outDir: string;
  let originalCwd: string;
  let dtsContent: string;

  beforeAll(async () => {
    outDir = path.join(BASIC_FIXTURE, "dist-types");
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    originalCwd = process.cwd();
    process.chdir(BASIC_FIXTURE);

    const opts: ServerBuildOptions = {
      srcDir: path.join(BASIC_FIXTURE, "src/server"),
      entry: "index.ts",
      format: "esm",
      bundled: [],
      types: true,
      nodeTarget: "node22",
    };

    await build(opts, {
      outDir,
      packageName: "node-red-test-basic",
      isDev: false,
    });

    dtsContent = fs.readFileSync(path.join(outDir, "index.d.ts"), "utf-8");
  }, 60000);

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
  });

  it("should generate index.d.ts", () => {
    expect(fs.existsSync(path.join(outDir, "index.d.ts"))).toBe(true);
  });

  // --- Class-based nodes ---

  it("should export class-based node as a named class", () => {
    expect(dtsContent).toContain("export declare class TestNode");
  });

  it("should export config schema for class-based node", () => {
    expect(dtsContent).toContain("TestNodeConfigSchema");
  });

  it("should export credentials schema for class-based node", () => {
    expect(dtsContent).toContain("TestNodeCredentialsSchema");
  });

  // --- Config nodes ---

  it("should export config node as a named class", () => {
    expect(dtsContent).toContain("export declare class ConfigServer");
  });

  it("should export config schema for config node", () => {
    expect(dtsContent).toContain("ConfigServerConfigSchema");
  });

  // --- Multiple nodes ---

  it("should export second node", () => {
    expect(dtsContent).toContain("SecondNode");
  });

  it("should export second node config schema", () => {
    expect(dtsContent).toContain("SecondNodeConfigSchema");
  });

  // --- Schema content ---

  it("should include schema property types", () => {
    // TestNode has name (string), timeout (number), enabled (boolean), server (NodeRef)
    expect(dtsContent).toContain("TString");
    expect(dtsContent).toContain("TNumber");
    expect(dtsContent).toContain("TBoolean");
  });

  it("should include NodeRef in schema types", () => {
    expect(dtsContent).toContain("TNodeRef");
  });

  // --- NodeRef ---

  it("should preserve NodeRef type in schema", () => {
    // TestNode has server: SchemaType.NodeRef(ConfigServer)
    expect(dtsContent).toContain("TNodeRef<ConfigServer>");
  });

  // --- Input/Output schemas for wired contracts ---

  it("should not export input schema when node has none", () => {
    // TestNode and SecondNode don't define inputSchema
    expect(dtsContent).not.toContain("TestNodeInputSchema");
    expect(dtsContent).not.toContain("SecondNodeInputSchema");
  });

  it("should not export output schema when node has none", () => {
    expect(dtsContent).not.toContain("TestNodeOutputsSchema");
    expect(dtsContent).not.toContain("SecondNodeOutputsSchema");
  });

  it("should not export credentials schema when node has none", () => {
    // SecondNode and ConfigServer don't define credentialsSchema
    expect(dtsContent).not.toContain("SecondNodeCredentialsSchema");
    expect(dtsContent).not.toContain("ConfigServerCredentialsSchema");
  });

  // --- Only referenced schemas ---

  it("should not export schemas that are not referenced by any node", () => {
    const schemaExports = dtsContent
      .split("\n")
      .filter(
        (l) =>
          l.includes("declare const") &&
          l.includes("Schema"),
      );
    for (const line of schemaExports) {
      expect(
        line.includes("TestNode") ||
          line.includes("SecondNode") ||
          line.includes("ConfigServer"),
      ).toBe(true);
    }
  });

  // --- Default export ---

  it("should have a default export", () => {
    expect(dtsContent).toContain("export default");
  });
});

describe("type generation — factory-based nodes", () => {
  let outDir: string;
  let originalCwd: string;
  let dtsContent: string;

  beforeAll(async () => {
    outDir = path.join(CUSTOM_FIXTURE, "dist-types");
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
    fs.mkdirSync(outDir, { recursive: true });

    originalCwd = process.cwd();
    process.chdir(CUSTOM_FIXTURE);

    const opts: ServerBuildOptions = {
      srcDir: path.join(CUSTOM_FIXTURE, "src/server"),
      entry: "index.ts",
      format: "esm",
      bundled: [],
      types: true,
      nodeTarget: "node22",
    };

    await build(opts, {
      outDir,
      packageName: "node-red-test-custom",
      isDev: false,
    });

    dtsContent = fs.readFileSync(path.join(outDir, "index.d.ts"), "utf-8");
  }, 60000);

  afterAll(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(outDir)) {
      fs.rmSync(outDir, { recursive: true });
    }
  });

  it("should generate index.d.ts", () => {
    expect(fs.existsSync(path.join(outDir, "index.d.ts"))).toBe(true);
  });

  it("should export factory-defined node", () => {
    expect(dtsContent).toContain("CustomNode");
  });

  it("should export config schema for factory node", () => {
    expect(dtsContent).toContain("CustomNodeConfigSchema");
  });

  it("should export input schema for factory node", () => {
    expect(dtsContent).toContain("CustomNodeInputSchema");
  });

  it("should export output schema for factory node", () => {
    expect(dtsContent).toContain("CustomNodeOutputsSchema");
  });

  it("should include schema property types in config schema", () => {
    expect(dtsContent).toContain("TString");
  });

  it("should include schema property types in input schema", () => {
    const inputMatch = dtsContent.match(
      /CustomNodeInputSchema.*?Schema<\s*\{[^}]*payload[^}]*\}/s,
    );
    expect(inputMatch).not.toBeNull();
  });

  it("should include schema property types in output schema", () => {
    expect(dtsContent).toContain("TNumber");
  });

  it("should export factory node as NodeConstructor<IIONode>", () => {
    expect(dtsContent).toContain("IIONode");
  });

  it("should export factory node with NodeConstructor type", () => {
    expect(dtsContent).toContain("NodeConstructor");
  });

  // --- defineConfigNode ---

  it("should export factory config node", () => {
    expect(dtsContent).toContain("ConfigServer");
  });

  it("should export config node as NodeConstructor<IConfigNode>", () => {
    expect(dtsContent).toContain("IConfigNode");
  });

  it("should export config schema for config node", () => {
    expect(dtsContent).toContain("ConfigServerConfigSchema");
  });

  it("should export credentials schema for config node", () => {
    expect(dtsContent).toContain("ConfigServerCredentialsSchema");
  });

  // --- no schemas ---

  it("should export factory node with no schemas", () => {
    expect(dtsContent).toContain("NoSchemaNode");
  });

  it("should type no-schema node with all any args", () => {
    const match = dtsContent.match(
      /NoSchemaNode:\s*NodeConstructor<IIONode<any,\s*any,\s*any,\s*any>>/,
    );
    expect(match).not.toBeNull();
  });

  // --- partial schemas (config only) ---

  it("should export factory node with partial schemas", () => {
    expect(dtsContent).toContain("MinimalNode");
  });

  it("should export config schema for partial node", () => {
    expect(dtsContent).toContain("MinimalNodeConfigSchema");
  });

  it("should type partial node with Infer for config and any for the rest", () => {
    const match = dtsContent.match(
      /MinimalNode:\s*NodeConstructor<IIONode<Infer<typeof\s+\w+>,\s*any,\s*any,\s*any>>/,
    );
    expect(match).not.toBeNull();
  });
});
