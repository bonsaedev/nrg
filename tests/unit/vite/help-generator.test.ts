import { describe, it, expect } from "vitest";
import {
  buildPropertyRow,
  generateSchemaSection,
  generateHelpDoc,
} from "../../../src/vite/client/plugins/help-generator";
import { getHelpTranslations } from "../../../src/vite/client/plugins/help-i18n";

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
        outputStart > 0
          ? inputSection.substring(0, outputStart)
          : inputSection;

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
          outputs: [
            { payload: "Success" },
            { error: "Error message" },
          ],
        },
        enUS,
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>Port 1</h4>");
      expect(doc).toContain("<h4>Port 2</h4>");
    });

    it("returns empty string when no schemas or labels exist", () => {
      const doc = generateHelpDoc({}, {}, enUS);
      expect(doc).toBe("");
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
  });
});
