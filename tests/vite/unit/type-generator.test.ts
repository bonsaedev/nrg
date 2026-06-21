import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  collectTsFiles,
  toPascalCase,
  getNodeTypeExports,
  getSchemaReferences,
  getFactoryInfo,
  buildTypeArg,
  buildNodeReexports,
  rewriteRuntimeTypeImports,
} from "@/vite/server/plugins/type-generator";

const tmpDirs: string[] = [];

function makeTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-type-gen-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs.length = 0;
});

describe("collectTsFiles", () => {
  it("returns empty array for nonexistent dir", () => {
    const result = collectTsFiles("/tmp/does-not-exist-xyz-123");
    expect(result).toEqual([]);
  });

  it("collects .ts files recursively", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "a.ts"), "");
    fs.writeFileSync(path.join(dir, "b.ts"), "");
    const result = collectTsFiles(dir);
    expect(result).toHaveLength(2);
    expect(result).toContain(path.join(dir, "a.ts"));
    expect(result).toContain(path.join(dir, "b.ts"));
  });

  it("excludes .d.ts files", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "index.ts"), "");
    fs.writeFileSync(path.join(dir, "index.d.ts"), "");
    const result = collectTsFiles(dir);
    expect(result).toEqual([path.join(dir, "index.ts")]);
  });

  it("returns files from nested directories", () => {
    const dir = makeTmpDir();
    const nested = path.join(dir, "sub", "deep");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(dir, "root.ts"), "");
    fs.writeFileSync(path.join(nested, "nested.ts"), "");
    const result = collectTsFiles(dir);
    expect(result).toHaveLength(2);
    expect(result).toContain(path.join(dir, "root.ts"));
    expect(result).toContain(path.join(nested, "nested.ts"));
  });
});

describe("toPascalCase", () => {
  it("converts kebab-case", () => {
    expect(toPascalCase("your-node")).toBe("YourNode");
  });

  it("converts snake_case", () => {
    expect(toPascalCase("remote_server")).toBe("RemoteServer");
  });

  it("handles single word", () => {
    expect(toPascalCase("simple")).toBe("Simple");
  });
});

describe("getNodeTypeExports", () => {
  it("returns pairs for exported types used as generic args on IONode", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "my-node.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
export type Config = { host: string };
export type Credentials = { apiKey: string };
export default class MyNode extends IONode<Config, Credentials> {
  input() {}
}
`,
    );
    const result = getNodeTypeExports(file);
    expect(result).toEqual([
      { localName: "Config", semanticName: "Config" },
      { localName: "Credentials", semanticName: "Credentials" },
    ]);
  });

  it("returns pairs for ConfigNode generics", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "config-node.ts");
    fs.writeFileSync(
      file,
      `
import { ConfigNode } from "@bonsae/nrg/server";
export type Cfg = { endpoint: string };
export type Creds = { token: string };
export default class MyConfig extends ConfigNode<Cfg, Creds> {}
`,
    );
    const result = getNodeTypeExports(file);
    expect(result).toEqual([
      { localName: "Cfg", semanticName: "Config" },
      { localName: "Creds", semanticName: "Credentials" },
    ]);
  });

  it("returns empty for files with no exported types", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "no-types.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
type Internal = { x: number };
export default class MyNode extends IONode<Internal> {
  input() {}
}
`,
    );
    const result = getNodeTypeExports(file);
    expect(result).toEqual([]);
  });

  it("returns empty for files with no default class", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "no-class.ts");
    fs.writeFileSync(
      file,
      `
export type Config = { host: string };
export class NotDefault {}
`,
    );
    const result = getNodeTypeExports(file);
    expect(result).toEqual([]);
  });

  it("maps position to semantic name", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "full-node.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
export type A = {};
export type B = {};
export type C = {};
export type D = {};
export type E = {};
export default class Full extends IONode<A, B, C, D, E> {}
`,
    );
    const result = getNodeTypeExports(file);
    expect(result).toEqual([
      { localName: "A", semanticName: "Config" },
      { localName: "B", semanticName: "Credentials" },
      { localName: "C", semanticName: "Input" },
      { localName: "D", semanticName: "Output" },
      { localName: "E", semanticName: "Settings" },
    ]);
  });

  it("skips non-exported types", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "mixed.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
type Private = { internal: boolean };
export type Public = { visible: boolean };
export default class MyNode extends IONode<Private, Public> {}
`,
    );
    const result = getNodeTypeExports(file);
    // Private is at position 0 (Config) but not exported, so skipped
    // Public is at position 1 (Credentials) and exported
    expect(result).toEqual([
      { localName: "Public", semanticName: "Credentials" },
    ]);
  });

  it("handles complex/non-identifier type args (preserves position with empty string)", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "complex.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
export type Creds = { key: string };
export default class MyNode extends IONode<{ inline: true }, Creds> {}
`,
    );
    const result = getNodeTypeExports(file);
    // Position 0 is a complex type literal (empty string), so skipped
    // Position 1 is Creds → Credentials
    expect(result).toEqual([
      { localName: "Creds", semanticName: "Credentials" },
    ]);
  });
});

describe("getFactoryInfo", () => {
  it("returns { factoryName: 'defineIONode' } for defineIONode", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "io-factory.ts");
    fs.writeFileSync(
      file,
      `
import { defineIONode } from "@bonsae/nrg/server";
export default defineIONode({ type: "my-node", input() {} });
`,
    );
    const result = getFactoryInfo(file);
    expect(result).toEqual({ factoryName: "defineIONode" });
  });

  it("returns { factoryName: 'defineConfigNode' } for defineConfigNode", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "config-factory.ts");
    fs.writeFileSync(
      file,
      `
import { defineConfigNode } from "@bonsae/nrg/server";
export default defineConfigNode({ type: "my-config" });
`,
    );
    const result = getFactoryInfo(file);
    expect(result).toEqual({ factoryName: "defineConfigNode" });
  });

  it("returns null for class-based nodes", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "class-node.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
export default class MyNode extends IONode {
  input() {}
}
`,
    );
    const result = getFactoryInfo(file);
    expect(result).toBeNull();
  });

  it("returns null for files without export default", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "no-default.ts");
    fs.writeFileSync(
      file,
      `
export function helper() {}
`,
    );
    const result = getFactoryInfo(file);
    expect(result).toBeNull();
  });
});

describe("getSchemaReferences", () => {
  it("extracts class-based schema refs", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "class-schemas.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
import { MyConfigSchema } from "../schemas/my-node";

export default class MyNode extends IONode {
  static readonly configSchema = MyConfigSchema;
  input() {}
}
`,
    );
    const result = getSchemaReferences(file);
    expect(result).toEqual([
      {
        localName: "MyConfigSchema",
        semanticName: "ConfigSchema",
        importSource: "../schemas/my-node",
        tupleProp: undefined,
        recordPortName: undefined,
      },
    ]);
  });

  it("extracts factory-based schema refs", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "factory-schemas.ts");
    fs.writeFileSync(
      file,
      `
import { defineIONode } from "@bonsae/nrg/server";
import { InputSchema } from "../schemas/input";

export default defineIONode({
  type: "my-node",
  inputSchema: InputSchema,
  input() {},
});
`,
    );
    const result = getSchemaReferences(file);
    expect(result).toEqual([
      {
        localName: "InputSchema",
        semanticName: "InputSchema",
        importSource: "../schemas/input",
        tupleProp: undefined,
        recordPortName: undefined,
      },
    ]);
  });

  it("handles array outputsSchema", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "array-outputs.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
import { Schema1 } from "../schemas/s1";
import { Schema2 } from "../schemas/s2";

export default class MyNode extends IONode {
  static readonly outputsSchema = [Schema1, Schema2];
  input() {}
}
`,
    );
    const result = getSchemaReferences(file);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      localName: "Schema1",
      semanticName: "Schema1",
      importSource: "../schemas/s1",
      tupleProp: "OutputsSchema",
      recordPortName: undefined,
    });
    expect(result[1]).toEqual({
      localName: "Schema2",
      semanticName: "Schema2",
      importSource: "../schemas/s2",
      tupleProp: "OutputsSchema",
      recordPortName: undefined,
    });
  });

  it("handles record outputsSchema", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "record-outputs.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
import { SuccessSchema } from "../schemas/success";
import { FailureSchema } from "../schemas/failure";

export default class MyNode extends IONode {
  static readonly outputsSchema = { success: SuccessSchema, failure: FailureSchema };
  input() {}
}
`,
    );
    const result = getSchemaReferences(file);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      localName: "SuccessSchema",
      semanticName: "SuccessSchema",
      importSource: "../schemas/success",
      tupleProp: "OutputsSchema",
      recordPortName: "success",
    });
    expect(result[1]).toEqual({
      localName: "FailureSchema",
      semanticName: "FailureSchema",
      importSource: "../schemas/failure",
      tupleProp: "OutputsSchema",
      recordPortName: "failure",
    });
  });

  it("maps import sources correctly", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "multi-source.ts");
    fs.writeFileSync(
      file,
      `
import { defineIONode } from "@bonsae/nrg/server";
import { CfgSchema } from "./schemas/config";
import { CredsSchema } from "../shared/creds";

export default defineIONode({
  type: "multi",
  configSchema: CfgSchema,
  credentialsSchema: CredsSchema,
  input() {},
});
`,
    );
    const result = getSchemaReferences(file);
    expect(result).toHaveLength(2);
    const cfg = result.find((r) => r.localName === "CfgSchema");
    const creds = result.find((r) => r.localName === "CredsSchema");
    expect(cfg!.importSource).toBe("./schemas/config");
    expect(creds!.importSource).toBe("../shared/creds");
  });

  it("returns empty for files with no schema references", () => {
    const dir = makeTmpDir();
    const file = path.join(dir, "no-schemas.ts");
    fs.writeFileSync(
      file,
      `
import { IONode } from "@bonsae/nrg/server";
export default class Plain extends IONode {
  input() {}
}
`,
    );
    const result = getSchemaReferences(file);
    expect(result).toEqual([]);
  });
});

describe("buildTypeArg", () => {
  it('returns "any" when no schemas for the semantic name', () => {
    const map = new Map<string, string[]>();
    expect(buildTypeArg(map, "ConfigSchema")).toBe("any");
  });

  it("returns Infer<typeof X> for single schema", () => {
    const map = new Map<string, string[]>([["ConfigSchema", ["MySchema"]]]);
    expect(buildTypeArg(map, "ConfigSchema")).toBe("Infer<typeof MySchema>");
  });

  it("returns tuple for arrays", () => {
    const map = new Map<string, string[]>([
      ["OutputsSchema", ["SchemaA", "SchemaB"]],
    ]);
    expect(buildTypeArg(map, "OutputsSchema")).toBe(
      "[Infer<typeof SchemaA>, Infer<typeof SchemaB>]",
    );
  });

  it("returns record for named ports", () => {
    const map = new Map<string, string[]>([
      ["OutputsSchema", ["SuccessSchema", "FailureSchema"]],
    ]);
    const portNameMap = new Map<string, string>([
      ["SuccessSchema", "success"],
      ["FailureSchema", "failure"],
    ]);
    expect(buildTypeArg(map, "OutputsSchema", portNameMap)).toBe(
      "{ success: Infer<typeof SuccessSchema>, failure: Infer<typeof FailureSchema> }",
    );
  });
});

describe("buildNodeReexports", () => {
  it("generates proper export statements for class-based nodes", () => {
    const dir = makeTmpDir();
    const nodesDir = path.join(dir, "nodes");
    fs.mkdirSync(nodesDir, { recursive: true });

    fs.writeFileSync(
      path.join(nodesDir, "my-node.ts"),
      `
import { IONode } from "@bonsae/nrg/server";
export type Config = { host: string };
export default class MyNode extends IONode<Config> {
  input() {}
}
`,
    );

    const entryFile = path.join(dir, "index.ts");
    fs.writeFileSync(entryFile, "");

    const result = buildNodeReexports(dir, entryFile);
    expect(result).toContain(
      'export { default as MyNode } from "./nodes/my-node"',
    );
    expect(result).toContain("Config as MyNodeConfig");
  });

  it("generates typed re-exports for factory-based nodes", () => {
    const dir = makeTmpDir();
    const nodesDir = path.join(dir, "nodes");
    const schemasDir = path.join(dir, "schemas");
    fs.mkdirSync(nodesDir, { recursive: true });
    fs.mkdirSync(schemasDir, { recursive: true });

    fs.writeFileSync(
      path.join(schemasDir, "config.ts"),
      `export const ConfigSchema = {};`,
    );

    fs.writeFileSync(
      path.join(nodesDir, "factory-node.ts"),
      `
import { defineIONode } from "@bonsae/nrg/server";
import { ConfigSchema } from "../schemas/config";

export default defineIONode({
  type: "factory-node",
  configSchema: ConfigSchema,
  input() {},
});
`,
    );

    const entryFile = path.join(dir, "index.ts");
    fs.writeFileSync(entryFile, "");

    const result = buildNodeReexports(dir, entryFile);
    expect(result).toContain("import _FactoryNode from");
    expect(result).toContain("NodeConstructor<IIONode<");
    expect(result).toContain("export const FactoryNode");
  });

  it("returns empty string for empty nodes directory", () => {
    const dir = makeTmpDir();
    const nodesDir = path.join(dir, "nodes");
    fs.mkdirSync(nodesDir, { recursive: true });

    const entryFile = path.join(dir, "index.ts");
    fs.writeFileSync(entryFile, "");

    const result = buildNodeReexports(dir, entryFile);
    expect(result).toBe("");
  });
});

describe("rewriteRuntimeTypeImports", () => {
  it("rewrites toolkit specifiers to the runtime in emitted .d.ts", () => {
    const dir = makeTmpDir();
    const dts = [
      `import { IONode } from '@bonsae/nrg/server';`,
      `import { defineNode } from "@bonsae/nrg/client";`,
      `import { Connection } from 'jsforce';`,
      `export declare class Foo extends IONode<any, any, any, any> {}`,
    ].join("\n");
    fs.writeFileSync(path.join(dir, "index.d.ts"), dts);

    rewriteRuntimeTypeImports(dir, ["index"]);

    const out = fs.readFileSync(path.join(dir, "index.d.ts"), "utf-8");
    expect(out).toContain(`from '@bonsae/nrg-runtime/server'`);
    expect(out).toContain(`from "@bonsae/nrg-runtime/client"`);
    expect(out).not.toContain(`'@bonsae/nrg/server'`);
    expect(out).not.toContain(`"@bonsae/nrg/client"`);
    // Unrelated imports are untouched.
    expect(out).toContain(`from 'jsforce'`);
  });

  it("leaves longer specifiers that merely share a prefix untouched", () => {
    const dir = makeTmpDir();
    const dts = `import { x } from "@bonsae/nrg/server-extras";\n`;
    fs.writeFileSync(path.join(dir, "index.d.ts"), dts);

    rewriteRuntimeTypeImports(dir, ["index"]);

    const out = fs.readFileSync(path.join(dir, "index.d.ts"), "utf-8");
    expect(out).toContain(`"@bonsae/nrg/server-extras"`);
  });

  it("is a no-op when the entry .d.ts does not exist", () => {
    const dir = makeTmpDir();
    expect(() => rewriteRuntimeTypeImports(dir, ["missing"])).not.toThrow();
  });
});
