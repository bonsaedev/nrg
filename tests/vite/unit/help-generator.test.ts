import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  buildPropertyRow,
  generateSchemaSection,
  generateHelpDoc,
  loadNodeLabels,
  discoverLanguages,
  helpGenerator,
} from "@/tools/vite/client/plugins/help-generator";
import { getHelpTranslations } from "@/tools/vite/client/plugins/help-i18n";
import { nodeDefsPath } from "@/tools/vite/utils";
import { logger } from "@/tools/vite/logger";

const enUS = getHelpTranslations("en-US");
const ptBR = getHelpTranslations("pt-BR");

describe("help-generator", () => {
  describe("buildPropertyRow", () => {
    it("builds a row from a simple string schema", () => {
      const row = buildPropertyRow(
        "url",
        { type: "string", default: "https://example.com" },
        true,
        "URL",
      );
      expect(row.name).toBe("url");
      expect(row.label).toBe("URL");
      expect(row.type).toBe("string");
      expect(row.required).toBe(true);
      expect(row.defaultVal).toBe('"https://example.com"');
    });

    it("includes constraints in type string", () => {
      const row = buildPropertyRow(
        "count",
        { type: "number", minimum: 1, maximum: 100 },
        false,
      );
      expect(row.type).toContain("min: 1");
      expect(row.type).toContain("max: 100");
      expect(row.required).toBe(false);
      expect(row.label).toBe("");
    });

    it("handles NodeRef type", () => {
      const row = buildPropertyRow(
        "server",
        { type: "string", "x-nrg-node-type": "remote-server" },
        true,
      );
      expect(row.type).toBe("NodeRef → remote-server");
    });

    it("handles TypedInput type", () => {
      const row = buildPropertyRow(
        "target",
        { "x-nrg-typed-input": true },
        true,
      );
      expect(row.type).toBe("TypedInput");
    });

    it("leaves the type blank for an Unsafe<T>() with no parser-recovered type", () => {
      // Unsafe<T>() compiles to an empty schema; T is erased at runtime, so with
      // no parser-recovered type there is nothing to show.
      const row = buildPropertyRow(
        "connection",
        { description: "open pool" },
        true,
      );
      expect(row.type).toBe("");
      expect(row.description).toBe("open pool");
    });

    it("uses the parser-recovered type for an Unsafe<T>() field", () => {
      // The 5th arg is the T text recovered from source by the unsafe-types
      // parser (e.g. SchemaType.Unsafe<Connection>() → "Connection").
      const row = buildPropertyRow(
        "connection",
        { description: "open pool" },
        true,
        undefined,
        "Connection",
      );
      expect(row.type).toBe("Connection");
    });

    it("handles enum values", () => {
      const row = buildPropertyRow(
        "method",
        { type: "string", enum: ["GET", "POST"] },
        true,
      );
      expect(row.type).toContain("(GET, POST)");
    });

    it("excludes password format from constraints", () => {
      const row = buildPropertyRow(
        "secret",
        { type: "string", format: "password" },
        false,
      );
      expect(row.type).toBe("string");
      expect(row.type).not.toContain("password");
    });

    it("returns empty default for undefined default", () => {
      const row = buildPropertyRow("field", { type: "string" }, true);
      expect(row.defaultVal).toBe("");
    });

    it("includes minLength and maxLength constraints", () => {
      const row = buildPropertyRow(
        "name",
        { type: "string", minLength: 3, maxLength: 50 },
        false,
      );
      expect(row.type).toContain("min: 3");
      expect(row.type).toContain("max: 50");
    });

    it("includes pattern constraint", () => {
      const row = buildPropertyRow(
        "code",
        { type: "string", pattern: "^[A-Z]+$" },
        false,
      );
      expect(row.type).toContain("pattern: `^[A-Z]+$`");
    });

    it("includes non-password format constraint", () => {
      const row = buildPropertyRow(
        "email",
        { type: "string", format: "email" },
        false,
      );
      expect(row.type).toContain("format: email");
    });

    it("includes description from schema", () => {
      const row = buildPropertyRow(
        "host",
        { type: "string", description: "The server hostname" },
        false,
      );
      expect(row.description).toBe("The server hostname");
    });

    it("returns empty description when not provided", () => {
      const row = buildPropertyRow("host", { type: "string" }, false);
      expect(row.description).toBe("");
    });

    it("returns empty type when schema has no type indicators", () => {
      const row = buildPropertyRow("field", { default: "val" }, false);
      expect(row.type).toBe("");
    });
  });

  describe("generateSchemaSection", () => {
    const schema = {
      properties: {
        host: { type: "string", default: "localhost" },
        url: { type: "string", default: "https://example.com" },
      },
      required: ["url"],
    };

    it("generates a table with translated headers", () => {
      const section = generateSchemaSection({
        title: ptBR.sections.properties,
        schema,
        t: ptBR,
        labels: { host: "Servidor", url: "URL" },
      });

      expect(section).toContain("Propriedades");
      expect(section).toContain("Rótulo");
      expect(section).toContain("Propriedade");
      expect(section).toContain("Tipo");
      expect(section).toContain("Obrigatório");
      expect(section).toContain("Sim");
      expect(section).toContain("Não");
    });

    it("puts label column before property column", () => {
      const section = generateSchemaSection({
        title: "Test",
        schema,
        t: enUS,
        labels: { host: "Host", url: "URL" },
      });

      const labelPos = section.indexOf("<th>Label</th>");
      const propPos = section.indexOf("<th>Property</th>");
      expect(labelPos).toBeLessThan(propPos);
    });

    it("includes Default column when includeDefault is true", () => {
      const section = generateSchemaSection({
        title: "Test",
        schema,
        t: enUS,
        labels: { host: "Host", url: "URL" },
        includeDefault: true,
      });

      expect(section).toContain("Default");
    });

    it("excludes Default column when includeDefault is false", () => {
      const section = generateSchemaSection({
        title: "Test",
        schema,
        t: enUS,
        labels: { host: "Host", url: "URL" },
        includeDefault: false,
      });

      expect(section).not.toContain("Default");
    });

    it("defaults to including Default column", () => {
      const section = generateSchemaSection({
        title: "Test",
        schema,
        t: enUS,
      });

      expect(section).toContain("Default");
    });

    it("skips system fields", () => {
      const schemaWithSystem = {
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          name: { type: "string" },
          z: { type: "string" },
          wires: { type: "array" },
          _users: { type: "array" },
          url: { type: "string" },
        },
      };
      const section = generateSchemaSection({
        title: "Test",
        schema: schemaWithSystem,
        t: enUS,
      });

      expect(section).toContain("url");
      expect(section).not.toContain("<td>id</td>");
      expect(section).not.toContain("<td>type</td>");
      expect(section).not.toContain("<td>z</td>");
      expect(section).not.toContain("<td>wires</td>");
      expect(section).not.toContain("<td>_users</td>");
    });

    it("hides nrg system config fields, keeps real properties", () => {
      // The lifecycle-port toggles + per-port output settings are baked into
      // every IONode's config; they belong in the Capabilities table, not here.
      const schema = {
        properties: {
          errorPort: { type: "boolean" },
          completePort: { type: "boolean" },
          statusPort: { type: "boolean" },
          validateInput: { type: "boolean" },
          outputReturnProperties: { type: "object" },
          outputContextModes: { type: "object" },
          inputSchema: { type: "string" },
          outputSchemas: { type: "object" },
          connection: { "x-nrg-node-type": "salesforce-connection" },
          query: { type: "string" },
        },
      };
      const section = generateSchemaSection({ title: "P", schema, t: enUS });

      // real properties kept
      expect(section).toContain("<td>connection</td>");
      expect(section).toContain("NodeRef → salesforce-connection");
      expect(section).toContain("<td>query</td>");
      // nrg system fields hidden
      for (const f of [
        "errorPort",
        "completePort",
        "statusPort",
        "validateInput",
        "outputReturnProperties",
        "outputContextModes",
        "inputSchema",
        "outputSchemas",
      ]) {
        expect(section).not.toContain(`<td>${f}</td>`);
      }
    });

    it("returns empty string for undefined schema", () => {
      expect(
        generateSchemaSection({ title: "Test", schema: undefined, t: enUS }),
      ).toBe("");
    });

    it("returns empty string for schema with no properties", () => {
      expect(
        generateSchemaSection({ title: "Test", schema: {}, t: enUS }),
      ).toBe("");
    });

    it("omits label column when no labels provided", () => {
      const section = generateSchemaSection({
        title: "Test",
        schema,
        t: enUS,
      });

      expect(section).not.toContain("<th>Label</th>");
    });

    it("uses custom heading level", () => {
      const section = generateSchemaSection({
        title: "Ports",
        schema,
        t: enUS,
        heading: "####",
      });

      expect(section).toMatch(/^<h4>Ports<\/h4>/);
    });

    it("renders empty default cell when property has no default value", () => {
      const schemaNoDefaults = {
        properties: {
          host: { type: "string" },
        },
      };
      const section = generateSchemaSection({
        title: "Test",
        schema: schemaNoDefaults,
        t: enUS,
        labels: { host: "Host" },
        includeDefault: true,
      });

      expect(section).toContain("<th>Default</th>");
      expect(section).not.toContain("<code>");
    });

    it("omits both label and default columns when no labels and includeDefault is false", () => {
      const section = generateSchemaSection({
        title: "Test",
        schema,
        t: enUS,
        includeDefault: false,
      });

      expect(section).not.toContain("<th>Label</th>");
      expect(section).not.toContain("<th>Default</th>");
      expect(section).toContain("<th>Property</th>");
      expect(section).toContain("<th>Type</th>");
      expect(section).toContain("width:40%");
    });

    it("returns empty string when all properties are system fields", () => {
      const systemOnly = {
        properties: {
          id: { type: "string" },
          type: { type: "string" },
          wires: { type: "array" },
        },
      };
      expect(
        generateSchemaSection({ title: "Test", schema: systemOnly, t: enUS }),
      ).toBe("");
    });
  });

  describe("generateHelpDoc", () => {
    const mockNodeClass = {
      configSchema: {
        properties: {
          host: { type: "string", default: "localhost" },
          url: { type: "string", default: "https://api.example.com" },
        },
        required: ["url"],
      },
      credentialsSchema: {
        properties: {
          apiKey: { type: "string", format: "password", default: "" },
        },
      },
      inputSchema: {
        properties: {
          payload: { type: "string" },
        },
      },
      outputsSchema: {
        properties: {
          payload: { type: "object" },
          status: { type: "number" },
        },
      },
    };

    it("includes description as first paragraph wrapped in p tag", () => {
      const doc = generateHelpDoc(
        mockNodeClass,
        { description: "Fetches data from an API." },
        enUS,
      );

      expect(doc).toMatch(/^<p>Fetches data from an API\.<\/p>/);
    });

    it("generates Properties section with Default column", () => {
      const doc = generateHelpDoc(
        mockNodeClass,
        { configs: { url: "URL" } },
        enUS,
      );

      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).toContain("<th>Default</th>");
    });

    it("generates Input section without Default column", () => {
      const doc = generateHelpDoc(
        mockNodeClass,
        { input: { payload: "Payload" } },
        enUS,
      );

      const inputSection = doc.substring(doc.indexOf("<h3>Input</h3>"));
      const outputStart = inputSection.indexOf("<h3>Output</h3>");
      const inputOnly =
        outputStart > 0 ? inputSection.substring(0, outputStart) : inputSection;

      expect(inputOnly).toContain("<h3>Input</h3>");
      expect(inputOnly).not.toContain("<th>Default</th>");
    });

    it("generates Output section without Default column", () => {
      const doc = generateHelpDoc(
        mockNodeClass,
        { outputs: [{ payload: "Result", status: "Status code" }] },
        enUS,
      );

      const outputSection = doc.substring(doc.indexOf("<h3>Output</h3>"));

      expect(outputSection).toContain("<h3>Output</h3>");
      expect(outputSection).not.toContain("<th>Default</th>");
    });

    it("translates all section titles", () => {
      const doc = generateHelpDoc(
        mockNodeClass,
        {
          description: "Descrição do nó.",
          configs: { url: "URL" },
          credentials: { apiKey: "Chave" },
          input: { payload: "Entrada" },
          outputs: [{ payload: "Saída" }],
        },
        ptBR,
      );

      expect(doc).toContain("<h3>Propriedades</h3>");
      expect(doc).toContain("<h3>Credenciais</h3>");
      expect(doc).toContain("<h3>Entrada</h3>");
      expect(doc).toContain("<h3>Saída</h3>");
    });

    it("handles multi-port outputs", () => {
      const multiOutputNode = {
        ...mockNodeClass,
        outputsSchema: [
          { properties: { payload: { type: "object" } } },
          { properties: { error: { type: "string" } } },
        ],
      };

      const doc = generateHelpDoc(
        multiOutputNode,
        {
          outputs: [{ payload: "Success" }, { error: "Error message" }],
        },
        enUS,
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>Port 1</h4>");
      expect(doc).toContain("<h4>Port 2</h4>");
    });

    it("handles record-based named output ports", () => {
      const namedOutputNode = {
        ...mockNodeClass,
        outputsSchema: {
          success: { properties: { payload: { type: "string" } } },
          failure: { properties: { reason: { type: "string" } } },
        },
      };

      const doc = generateHelpDoc(
        namedOutputNode,
        {
          outputs: {
            success: { payload: "Result" },
            failure: { reason: "Error reason" },
          } as any,
        },
        enUS,
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>success</h4>");
      expect(doc).toContain("<h4>failure</h4>");
    });

    it("handles record outputs without labels", () => {
      const namedOutputNode = {
        ...mockNodeClass,
        outputsSchema: {
          success: { properties: { payload: { type: "string" } } },
          failure: { properties: { reason: { type: "string" } } },
        },
      };

      const doc = generateHelpDoc(namedOutputNode, {}, enUS);

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>success</h4>");
      expect(doc).toContain("<h4>failure</h4>");
    });

    it("returns empty string when no schemas or labels exist", () => {
      const doc = generateHelpDoc({}, {}, enUS);
      expect(doc).toBe("");
    });

    it("skips array output ports that produce empty sections", () => {
      const node = {
        outputsSchema: [
          { properties: { id: { type: "string" } } },
          { properties: { type: { type: "string" } } },
        ],
      };

      const doc = generateHelpDoc(node, {}, enUS);
      expect(doc).not.toContain("Outputs");
    });

    it("skips record output ports that produce empty sections", () => {
      const node = {
        outputsSchema: {
          first: { properties: { id: { type: "string" } } },
          second: { properties: { type: { type: "string" } } },
        },
      };

      const doc = generateHelpDoc(node, {}, enUS);
      expect(doc).not.toContain("Outputs");
    });

    it("skips single output when section is empty", () => {
      const node = {
        outputsSchema: {
          type: "object",
          properties: { id: { type: "string" } },
        },
      };

      const doc = generateHelpDoc(node, {}, enUS);
      expect(doc).not.toContain("Output");
    });

    it("skips input section when schema has only system fields", () => {
      const node = {
        inputSchema: {
          properties: { id: { type: "string" }, type: { type: "string" } },
        },
      };

      const doc = generateHelpDoc(node, {}, enUS);
      // No Input *section* (the schema is all system fields). The Capabilities
      // table may still mention "Input ports", so target the section header.
      expect(doc).not.toContain("<h3>Input</h3>");
    });

    it("omits sections for missing schemas", () => {
      const nodeWithConfigOnly = {
        configSchema: {
          properties: { host: { type: "string", default: "localhost" } },
        },
      };

      const doc = generateHelpDoc(nodeWithConfigOnly, {}, enUS);

      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).not.toContain("<h3>Credentials</h3>");
      expect(doc).not.toContain("<h3>Input</h3>");
      expect(doc).not.toContain("<h3>Output</h3>");
    });

    it("surfaces parser-recovered Unsafe<T>() types for inputs and outputs", () => {
      // Schemas carry $ids; the parser map (built from source Unsafe<T>() args)
      // is keyed by $id. generateHelpDoc looks each property up and renders T in
      // the Type column for the input AND the output port.
      const node = {
        inputSchema: {
          $id: "demo:in",
          properties: { onTick: { description: "called per message" } },
          required: ["onTick"],
        },
        outputsSchema: {
          $id: "demo:out",
          properties: { connection: { description: "open pool" } },
          required: ["connection"],
        },
      };
      const unsafeTypes = new Map<string, Record<string, string>>([
        ["demo:in", { onTick: "MessageHandler" }],
        ["demo:out", { connection: "Connection" }],
      ]);

      const doc = generateHelpDoc(node, {}, enUS, unsafeTypes);

      expect(doc).toContain("<h3>Input</h3>");
      expect(doc).toContain("<td>MessageHandler</td>");
      expect(doc).toContain("<h3>Output</h3>");
      expect(doc).toContain("<td>Connection</td>");
    });

    it("leaves the Type cell blank when no parser map is provided", () => {
      // Discriminating: the type only appears via the parser map, never by
      // accident — a bare Unsafe<T>() output with no map renders an empty cell.
      const node = {
        outputsSchema: {
          $id: "demo:out2",
          properties: { connection: { description: "open pool" } },
          required: ["connection"],
        },
      };
      const doc = generateHelpDoc(node, {}, enUS);
      expect(doc).toContain("<h3>Output</h3>");
      expect(doc).toContain("<td>connection</td><td></td>");
    });
  });

  describe("loadNodeLabels", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-test-labels-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("returns empty object when file does not exist", () => {
      const result = loadNodeLabels(path.join(tmpDir, "nonexistent.json"));
      expect(result).toEqual({});
    });

    it("parses and returns all label fields", () => {
      const labelPath = path.join(tmpDir, "en-US.json");
      fs.writeFileSync(
        labelPath,
        JSON.stringify({
          description: "A test node",
          configs: { host: "Host" },
          credentials: { apiKey: "API Key" },
          input: { payload: "Payload" },
          outputs: [{ result: "Result" }],
        }),
      );

      const result = loadNodeLabels(labelPath);
      expect(result.description).toBe("A test node");
      expect(result.configs).toEqual({ host: "Host" });
      expect(result.credentials).toEqual({ apiKey: "API Key" });
      expect(result.input).toEqual({ payload: "Payload" });
      expect(result.outputs).toEqual([{ result: "Result" }]);
    });

    it("returns empty object on invalid JSON", () => {
      const labelPath = path.join(tmpDir, "bad.json");
      fs.writeFileSync(labelPath, "not valid json{{{");

      const result = loadNodeLabels(labelPath);
      expect(result).toEqual({});
    });

    it("returns undefined for missing optional fields", () => {
      const labelPath = path.join(tmpDir, "minimal.json");
      fs.writeFileSync(labelPath, JSON.stringify({ description: "Minimal" }));

      const result = loadNodeLabels(labelPath);
      expect(result.description).toBe("Minimal");
      expect(result.configs).toBeUndefined();
      expect(result.credentials).toBeUndefined();
      expect(result.input).toBeUndefined();
      expect(result.outputs).toBeUndefined();
    });
  });

  describe("discoverLanguages", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-test-langs-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("returns empty array when directory does not exist", () => {
      const result = discoverLanguages(tmpDir, "nonexistent-node");
      expect(result).toEqual([]);
    });

    it("returns language names from JSON files", () => {
      const nodeDir = path.join(tmpDir, "my-node");
      fs.mkdirSync(nodeDir);
      fs.writeFileSync(path.join(nodeDir, "en-US.json"), "{}");
      fs.writeFileSync(path.join(nodeDir, "pt-BR.json"), "{}");

      const result = discoverLanguages(tmpDir, "my-node");
      expect(result).toContain("en-US");
      expect(result).toContain("pt-BR");
      expect(result).toHaveLength(2);
    });

    it("filters out non-JSON files", () => {
      const nodeDir = path.join(tmpDir, "my-node");
      fs.mkdirSync(nodeDir);
      fs.writeFileSync(path.join(nodeDir, "en-US.json"), "{}");
      fs.writeFileSync(path.join(nodeDir, "README.md"), "docs");
      fs.writeFileSync(path.join(nodeDir, "notes.txt"), "notes");

      const result = discoverLanguages(tmpDir, "my-node");
      expect(result).toEqual(["en-US"]);
    });
  });

  describe("helpGenerator", () => {
    let tmpDir: string;
    let outDir: string;
    let localesOutDir: string;
    let docsDir: string;
    let labelsDir: string;

    // Write the node-defs.json the server build produces — the hand-off file the
    // help generator reads. It NO LONGER re-imports the built server bundle
    // (which, in a prod build, has its imports rewritten to @bonsae/nrg-runtime
    // and can't resolve at author build time — the M2 bug).
    function writeNodeDefs(defs: Record<string, any>[]) {
      const file = nodeDefsPath(outDir);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const definitions: Record<string, any> = {};
      for (const d of defs) if (d.type) definitions[d.type] = d;
      fs.writeFileSync(
        file,
        JSON.stringify({
          nodeTypes: Object.keys(definitions),
          definitions,
        }),
      );
    }

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-test-helpgen-"));
      outDir = path.join(tmpDir, "out");
      localesOutDir = path.join(tmpDir, "locales");
      docsDir = path.join(tmpDir, "docs");
      labelsDir = path.join(tmpDir, "labels");
      fs.mkdirSync(outDir);
      fs.mkdirSync(localesOutDir);
      fs.mkdirSync(docsDir);
      fs.mkdirSync(labelsDir);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("returns a plugin with correct metadata", () => {
      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      expect(plugin.name).toBe("vite-plugin-node-red:client:help-generator");
      expect(plugin.apply).toBe("build");
      expect(plugin.enforce).toBe("post");
      expect(plugin.closeBundle).toBeTypeOf("function");
    });

    it("warns and does nothing when node-defs.json is absent", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      expect(warn).toHaveBeenCalledTimes(1);
      expect(fs.readdirSync(localesOutDir)).toEqual([]);
    });

    it("generates help from node-defs.json WITHOUT importing any bundle (M2)", async () => {
      // Regression guard for M2: deliberately write NO index.js/index.mjs. A
      // prod build's bundle imports @bonsae/nrg-runtime (absent at author build
      // time); if help-gen ever re-imports the bundle again this fails.
      writeNodeDefs([
        {
          type: "test-node",
          configSchema: {
            properties: { host: { type: "string", default: "localhost" } },
          },
        },
      ]);
      const nodeLabelsDir = path.join(labelsDir, "test-node");
      fs.mkdirSync(nodeLabelsDir);
      fs.writeFileSync(
        path.join(nodeLabelsDir, "en-US.json"),
        JSON.stringify({ configs: { host: "Host" } }),
      );
      expect(fs.existsSync(path.join(outDir, "index.js"))).toBe(false);
      expect(fs.existsSync(path.join(outDir, "index.mjs"))).toBe(false);

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      const htmlPath = path.join(localesOutDir, "en-US", "index.html");
      expect(fs.existsSync(htmlPath)).toBe(true);
      const content = fs.readFileSync(htmlPath, "utf-8");
      expect(content).toContain('data-help-name="test-node"');
      expect(content).toContain("Properties");
    });

    it("skips node when manual .md docs exist", async () => {
      writeNodeDefs([
        {
          type: "manual-node",
          configSchema: { properties: { host: { type: "string" } } },
        },
      ]);

      const manualDir = path.join(docsDir, "manual-node");
      fs.mkdirSync(manualDir);
      fs.writeFileSync(path.join(manualDir, "en-US.md"), "# Manual docs");

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      expect(fs.existsSync(path.join(localesOutDir, "en-US"))).toBe(false);
    });

    it("skips node when manual .html docs exist", async () => {
      writeNodeDefs([
        {
          type: "html-node",
          configSchema: { properties: { host: { type: "string" } } },
        },
      ]);

      const manualDir = path.join(docsDir, "html-node");
      fs.mkdirSync(manualDir);
      fs.writeFileSync(path.join(manualDir, "en-US.html"), "<p>Manual</p>");

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      expect(fs.existsSync(path.join(localesOutDir, "en-US"))).toBe(false);
    });

    it("skips defs without type", async () => {
      writeNodeDefs([
        { configSchema: { properties: { host: { type: "string" } } } },
      ]);

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      expect(fs.readdirSync(localesOutDir)).toEqual([]);
    });

    it("auto-adds en-US when not in discovered languages", async () => {
      writeNodeDefs([
        {
          type: "no-labels-node",
          configSchema: {
            properties: { port: { type: "number", default: 8080 } },
          },
        },
      ]);

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      const htmlPath = path.join(localesOutDir, "en-US", "index.html");
      expect(fs.existsSync(htmlPath)).toBe(true);
      expect(fs.readFileSync(htmlPath, "utf-8")).toContain("no-labels-node");
    });

    it("generates for multiple languages", async () => {
      writeNodeDefs([
        {
          type: "multi-lang",
          configSchema: {
            properties: { host: { type: "string", default: "localhost" } },
          },
        },
      ]);

      const nodeLabelsDir = path.join(labelsDir, "multi-lang");
      fs.mkdirSync(nodeLabelsDir);
      fs.writeFileSync(
        path.join(nodeLabelsDir, "en-US.json"),
        JSON.stringify({ configs: { host: "Host" } }),
      );
      fs.writeFileSync(
        path.join(nodeLabelsDir, "pt-BR.json"),
        JSON.stringify({ configs: { host: "Servidor" } }),
      );

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      expect(
        fs.existsSync(path.join(localesOutDir, "en-US", "index.html")),
      ).toBe(true);
      expect(
        fs.existsSync(path.join(localesOutDir, "pt-BR", "index.html")),
      ).toBe(true);
    });

    it("appends to existing index.html", async () => {
      writeNodeDefs([
        {
          type: "append-node",
          configSchema: {
            properties: { val: { type: "string", default: "x" } },
          },
        },
      ]);

      const langDir = path.join(localesOutDir, "en-US");
      fs.mkdirSync(langDir, { recursive: true });
      fs.writeFileSync(
        path.join(langDir, "index.html"),
        '<script type="text/html" data-help-name="existing">old</script>',
      );

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      const content = fs.readFileSync(
        path.join(langDir, "index.html"),
        "utf-8",
      );
      expect(content).toContain("existing");
      expect(content).toContain("append-node");
    });

    it("warns and does not throw on malformed node-defs.json", async () => {
      const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
      const file = nodeDefsPath(outDir);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "not valid json{{{");

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await expect(
        (plugin.closeBundle as Function).call({}),
      ).resolves.not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(fs.readdirSync(localesOutDir)).toEqual([]);
    });

    it("skips node when generateHelpDoc produces no content", async () => {
      writeNodeDefs([{ type: "empty-node" }]);

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      expect(fs.readdirSync(localesOutDir)).toEqual([]);
    });

    it("aggregates multiple nodes into the same language file", async () => {
      writeNodeDefs([
        {
          type: "node-a",
          configSchema: {
            properties: { host: { type: "string", default: "a" } },
          },
        },
        {
          type: "node-b",
          configSchema: {
            properties: { port: { type: "number", default: 80 } },
          },
        },
      ]);

      const plugin = helpGenerator({
        outDir,
        localesOutDir,
        docsDir,
        labelsDir,
      });

      await (plugin.closeBundle as Function).call({});

      const htmlPath = path.join(localesOutDir, "en-US", "index.html");
      const content = fs.readFileSync(htmlPath, "utf-8");
      expect(content).toContain('data-help-name="node-a"');
      expect(content).toContain('data-help-name="node-b"');
    });
  });

  // The Node class's TypeScript types are the source of truth for docs; the
  // schema (when present) only enriches with default/description/constraints.
  describe("type-driven rendering", () => {
    it("renders rows and Type column from TS fields with no schema at all", () => {
      const section = generateSchemaSection({
        title: "Properties",
        schema: undefined,
        t: enUS,
        typeFields: [
          { name: "prefix", type: "string", optional: false },
          { name: "retries", type: "number", optional: true },
        ],
      });
      // required (non-optional) field
      expect(section).toContain("<td>prefix</td><td>string</td><td>Yes</td>");
      // optional TS field → not required
      expect(section).toContain("<td>retries</td><td>number</td><td>No</td>");
    });

    it("shows a union of string literals verbatim (the delimiter case)", () => {
      const section = generateSchemaSection({
        title: "Properties",
        schema: undefined,
        t: enUS,
        typeFields: [
          {
            name: "delimiter",
            type: '"COMMA" | "TAB" | "PIPE"',
            optional: false,
          },
        ],
      });
      expect(section).toContain(
        '<td>delimiter</td><td>"COMMA" | "TAB" | "PIPE"</td>',
      );
    });

    it("takes the Type from TS but enriches default/description from schema", () => {
      const section = generateSchemaSection({
        title: "Properties",
        schema: {
          properties: {
            timeout: {
              type: "number",
              default: 5000,
              description: "Request timeout",
              minimum: 0,
            },
          },
        },
        t: enUS,
        typeFields: [{ name: "timeout", type: "number", optional: false }],
      });
      // Type from TS + schema constraint appended
      expect(section).toContain("<td>number [min: 0]</td>");
      expect(section).toContain("<code>5000</code>");
      expect(section).toContain("Request timeout");
    });

    it("generateHelpDoc drives the config section from nodeTypes", () => {
      const doc = generateHelpDoc({ type: "my-node" }, {}, enUS, undefined, {
        type: "my-node",
        kind: "io",
        config: {
          text: '{ mode: "a" | "b" }',
          fields: [{ name: "mode", type: '"a" | "b"', optional: false }],
        },
      });
      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).toContain('<td>mode</td><td>"a" | "b"</td>');
    });
  });
});
