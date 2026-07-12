import { describe, it, expect, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import ts from "typescript";
import {
  extractNodeTypes,
  type NodeTypeInfo,
} from "@/tools/vite/server/plugins/node-type-info";
import { generateHelpDoc } from "@/tools/vite/client/plugins/help-generator";
import { getHelpTranslations } from "@/tools/vite/client/plugins/help-i18n";

// END-TO-END: extractor (ts.TypeChecker over a node CLASS) → help generator,
// with NO SCHEMA anywhere. This proves the core promise of the feature: a node
// is fully documented from its TypeScript types alone. We build a resolvable
// ts.Program so IONode<Config, Credentials, Input, Output, Settings> generics
// resolve to real types, extract the NodeTypeInfo, then feed that straight into
// generateHelpDoc and assert the rendered HTML carries every type-driven role.

const REPO = process.cwd();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-type-docs-pipeline-"));
const enUS = getHelpTranslations("en-US");

afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
function buildProgram(source: string): { program: ts.Program; dir: string } {
  const dir = path.join(TMP, `case-${counter++}`);
  fs.mkdirSync(path.join(dir, "nodes"), { recursive: true });
  const file = path.join(dir, "nodes", "the-node.ts");
  fs.writeFileSync(file, source);
  const program = ts.createProgram({
    rootNames: [file],
    options: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      baseUrl: REPO,
      paths: {
        "@bonsae/nrg/server": ["src/sdk/lib/server/index.ts"],
        "@bonsae/nrg/schema": ["src/sdk/lib/shared/schemas/index.ts"],
      },
    },
  });
  return { program, dir };
}

// A realistic node exercising every schema-LESS, type-driven path at once:
//  - Config typed ONLY via the first generic (no configSchema exists anywhere)
//  - a named-port Output ({ success, failure } via Infer) → titled ports
//  - an input() returning an object → the built-in Complete port type
//  - a Settings generic (5th slot)
const NODE_SOURCE = `
  import { IONode } from "@bonsae/nrg/server";
  import type { Infer, Port } from "@bonsae/nrg/server";
  import { defineSchema, SchemaType } from "@bonsae/nrg/schema";

  // Purely-typed config — there is NO schema for these fields anywhere.
  type Config = {
    endpoint: string;
    retries: number;
    mode: "sync" | "async";
    verbose?: boolean;
  };

  type Input = { payload: string };

  // Named-port output map: each port's message is typed from a schema via
  // Port<Infer<…>>, so the extractor splits it into one titled port per key.
  const Outputs = {
    success: defineSchema({ data: SchemaType.String() }, { $id: "pipe:success" }),
    failure: defineSchema({ reason: SchemaType.String() }, { $id: "pipe:failure" }),
  };
  type Output = {
    success: Port<Infer<typeof Outputs.success>>;
    failure: Port<Infer<typeof Outputs.failure>>;
  };

  type Settings = { apiKey: string; region: string };

  export default class ProcessorNode extends IONode<
    Config,
    never,
    Input,
    Output,
    Settings
  > {
    static readonly type = "processor";
    async input(msg: Input) {
      // The return type drives the built-in Complete port.
      return { ok: true, processed: 42 };
    }
  }
`;

describe("type-docs pipeline — extractor → help generator, no schema", () => {
  const { program, dir } = buildProgram(NODE_SOURCE);
  const infos = extractNodeTypes(program, dir);
  const info = infos.find((n) => n.type === "processor") as NodeTypeInfo;

  // Guard the input to the generator: this is the payload the server build hands
  // the client, produced entirely from the class's TS types (no schema).
  it("extracts a complete NodeTypeInfo from the class types alone", () => {
    expect(info).toBeDefined();
    expect(info.kind).toBe("io");
    // config recovered from generics (no schema involved)
    expect(info.config?.fields.map((f) => f.name)).toEqual([
      "endpoint",
      "retries",
      "mode",
      "verbose",
    ]);
    // two named output ports
    expect(info.outputs?.map((o) => o.name)).toEqual(["success", "failure"]);
    // complete port from input()'s return type
    expect(info.complete?.fields.map((f) => f.name).sort()).toEqual([
      "ok",
      "processed",
    ]);
    // settings from the 5th generic
    expect(info.settings?.fields.map((f) => f.name)).toEqual([
      "apiKey",
      "region",
    ]);
  });

  // The node CLASS passed to the generator has NO schemas at all — only `type`.
  // Everything in the produced HTML must therefore come from `info` (the TS types).
  const doc = generateHelpDoc({ type: "processor" }, {}, enUS, undefined, info);

  it("produces NON-EMPTY docs for a fully schema-less node (the key promise)", () => {
    expect(doc.trim().length).toBeGreaterThan(0);
    // sanity: the node class carried no schema of any kind
    const nodeClass: any = { type: "processor" };
    expect(nodeClass.configSchema).toBeUndefined();
    expect(nodeClass.outputsSchema).toBeUndefined();
    expect(nodeClass.settingsSchema).toBeUndefined();
  });

  it("renders the config field names AND their TS types in the Type column", () => {
    expect(doc).toContain("<h3>Properties</h3>");
    // name + TS type adjacency pins the Type column, not just a stray substring
    expect(doc).toContain("<td>endpoint</td><td>string</td>");
    expect(doc).toContain("<td>retries</td><td>number</td>");
    // a string-literal union is rendered verbatim as the type
    expect(doc).toContain('<td>mode</td><td>"sync" | "async"</td>');
    // optional TS field → Required = No, and the Type column is the bare type
    // (`boolean`, not `boolean | undefined`) — optionality is shown once.
    expect(doc).toContain("<td>verbose</td><td>boolean</td><td>No</td>");
    // required TS field → Required = Yes
    expect(doc).toContain("<td>endpoint</td><td>string</td><td>Yes</td>");
  });

  it("renders the named output ports as Outputs rows with the object shape inline", () => {
    expect(doc).toContain("<h3>Outputs</h3>");
    // Port name in the Port cell; the object shape inline in the Type cell.
    expect(doc).toContain("<td>success</td>");
    expect(doc).toContain("<td>failure</td>");
    expect(doc).toContain("data: string");
    expect(doc).toContain("reason: string");
    // no per-port sub-headings
    expect(doc).not.toContain("<h4>");
  });

  it("renders the Complete port from input()'s return type", () => {
    // Complete is a row in the Lifecycle table, its return value inlined.
    expect(doc).toContain("<h3>Lifecycle outputs</h3>");
    expect(doc).toContain("<td>Complete</td>");
    expect(doc).toContain("complete: {");
    expect(doc).toContain("ok: boolean");
    expect(doc).toContain("processed: number");
    expect(doc).toContain("source; input }");
    // not exploded into per-field rows
    expect(doc).not.toContain("<td>ok</td>");
  });

  it("renders the Settings fields from the 5th generic", () => {
    expect(doc).toContain("<h3>Settings</h3>");
    expect(doc).toContain("<td>apiKey</td><td>string</td>");
    expect(doc).toContain("<td>region</td><td>string</td>");
  });

  it("orders the type-driven sections: Properties → Settings → Outputs → Lifecycle", () => {
    const p = doc.indexOf("<h3>Properties</h3>");
    const s = doc.indexOf("<h3>Settings</h3>");
    const o = doc.indexOf("<h3>Outputs</h3>");
    const l = doc.indexOf("<h3>Lifecycle outputs</h3>");
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(s);
    expect(s).toBeLessThan(o);
    expect(o).toBeLessThan(l);
  });
});
