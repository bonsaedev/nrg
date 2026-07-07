import { describe, it, expect } from "vitest";
import {
  generateSchemaSection,
  generateHelpDoc,
} from "@/tools/vite/client/plugins/help-generator";
import { getHelpTranslations } from "@/tools/vite/client/plugins/help-i18n";
import type {
  NodeTypeInfo,
  NodeRoleType,
} from "@/tools/vite/server/plugins/node-type-info";

// The help generator renders from a node's TypeScript types (the source of
// truth, recovered by the build-time extractor into NodeTypeInfo). These tests
// call generateHelpDoc / generateSchemaSection directly with hand-built
// NodeTypeInfo so the rendering is exercised independently of the extractor.

const enUS = getHelpTranslations("en-US");

/** Build a NodeRoleType: object roles carry fields, primitive/union roles don't. */
function role(
  text: string,
  fields: { name: string; type: string; optional?: boolean }[] = [],
): NodeRoleType {
  return {
    text,
    fields: fields.map((f) => ({
      name: f.name,
      type: f.type,
      optional: f.optional ?? false,
    })),
  };
}

/** Minimal IONode NodeTypeInfo with whatever roles the test needs. */
function ioTypes(extra: Partial<NodeTypeInfo>): NodeTypeInfo {
  return { type: "n", kind: "io", ...extra };
}

describe("help-generator — type-driven rendering", () => {
  // (a) Settings section: type-driven from nodeTypes.settings, and schema-driven
  // (fallback) when no types are present.
  describe("(a) Settings section", () => {
    it("renders type-driven from nodeTypes.settings with the TS Type column", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          settings: role("{ apiKey: string; retries?: number }", [
            { name: "apiKey", type: "string" },
            { name: "retries", type: "number", optional: true },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Settings</h3>");
      // required (non-optional) TS field
      expect(doc).toContain("<td>apiKey</td><td>string</td><td>Yes</td>");
      // optional TS field → not required
      expect(doc).toContain("<td>retries</td><td>number</td><td>No</td>");
      // settings type-driven path renders a Default column (includeDefault: true)
      expect(doc).toContain("<th>Default</th>");
    });

    it("renders schema-driven when nodeTypes is undefined", () => {
      const doc = generateHelpDoc(
        {
          type: "n",
          settingsSchema: {
            properties: { logLevel: { type: "string", default: "info" } },
          },
        },
        {},
        enUS,
      );

      expect(doc).toContain("<h3>Settings</h3>");
      expect(doc).toContain("<td>logLevel</td><td>string</td>");
      expect(doc).toContain('<code>"info"</code>');
    });

    it("renders schema-driven settings when nodeTypes has no settings role", () => {
      // nodeTypes present (config only) but no `settings` → falls back to schema.
      const doc = generateHelpDoc(
        {
          type: "n",
          settingsSchema: {
            properties: { region: { type: "string", default: "us" } },
          },
        },
        {},
        enUS,
        undefined,
        ioTypes({
          config: role("{ host: string }", [{ name: "host", type: "string" }]),
        }),
      );

      // config comes from TS, settings from the schema
      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).toContain("<td>host</td><td>string</td>");
      expect(doc).toContain("<h3>Settings</h3>");
      expect(doc).toContain("<td>region</td><td>string</td>");
    });
  });

  // (b) Output ports: single object, positional tuple, named record, and a
  // primitive-typed port (code line, not a table).
  describe("(b) Output ports", () => {
    it("single object output → one <h3>Output</h3> section (not a group)", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              index: 0,
              role: role("{ result: string }", [
                { name: "result", type: "string" },
              ]),
            },
          ],
        }),
      );

      expect(doc).toContain("<h3>Output</h3>");
      expect(doc).not.toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<td>result</td><td>string</td>");
    });

    it("positional tuple ports → an <h3>Outputs</h3> group with Port 1 / Port 2", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              index: 0,
              role: role("{ a: string }", [{ name: "a", type: "string" }]),
            },
            {
              index: 1,
              role: role("{ b: number }", [{ name: "b", type: "number" }]),
            },
          ],
        }),
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>Port 1</h4>");
      expect(doc).toContain("<h4>Port 2</h4>");
      expect(doc).toContain("<td>a</td><td>string</td>");
      expect(doc).toContain("<td>b</td><td>number</td>");
    });

    it("named record ports → sections titled by port name", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              name: "success",
              index: 0,
              role: role("{ payload: string }", [
                { name: "payload", type: "string" },
              ]),
            },
            {
              name: "failure",
              index: 1,
              role: role("{ error: string }", [
                { name: "error", type: "string" },
              ]),
            },
          ],
        }),
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>success</h4>");
      expect(doc).toContain("<h4>failure</h4>");
      // NOT rendered as generic "Port N" when a name exists
      expect(doc).not.toContain("<h4>Port 1</h4>");
      expect(doc).toContain("<td>payload</td><td>string</td>");
    });

    it("a single primitive-typed port → a <code>type</code> line, not a table", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [{ index: 0, role: role("string", []) }],
        }),
      );

      expect(doc).toContain("<h3>Output</h3>");
      expect(doc).toContain("<p><code>string</code></p>");
      // The primitive port is a code line, not a property table (the unrelated
      // Capabilities table elsewhere in the doc may still be present).
      expect(doc).not.toContain("<td>string</td>");
    });

    it("a primitive positional port renders a code line at the <h4> heading level", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [
            { index: 0, role: role('"ok" | "fail"', []) },
            {
              index: 1,
              role: role("{ b: number }", [{ name: "b", type: "number" }]),
            },
          ],
        }),
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<h4>Port 1</h4>");
      expect(doc).toContain('<p><code>"ok" | "fail"</code></p>');
      // Port 2 (object) still renders a table
      expect(doc).toContain("<h4>Port 2</h4>");
      expect(doc).toContain("<td>b</td><td>number</td>");
    });
  });

  // (c) Complete section: object → table, primitive/union → code line, absent
  // when complete is undefined.
  describe("(c) Complete section", () => {
    it("object complete → a table (from input()'s return type)", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          complete: role("{ done: boolean; count: number }", [
            { name: "done", type: "boolean" },
            { name: "count", type: "number" },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Complete</h3>");
      expect(doc).toContain("<td>done</td><td>boolean</td>");
      expect(doc).toContain("<td>count</td><td>number</td>");
      // complete uses includeDefault: false → no Default column
      expect(doc).not.toContain("<th>Default</th>");
    });

    it("primitive/union complete → a code line, not a table", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({ complete: role('"ok" | "fail"', []) }),
      );

      expect(doc).toContain("<h3>Complete</h3>");
      expect(doc).toContain('<p><code>"ok" | "fail"</code></p>');
      expect(doc).not.toContain("<table");
    });

    it("is absent when nodeTypes.complete is undefined", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          config: role("{ host: string }", [{ name: "host", type: "string" }]),
        }),
      );

      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).not.toContain("Complete");
    });
  });

  // (d) Schema enrichment: Type comes from TS; default/description/constraints
  // (min/max/pattern/format) come from the schema; labels are applied.
  describe("(d) schema enrichment over TS types", () => {
    it("keeps the TS Type but appends schema constraints and default/description", () => {
      const section = generateSchemaSection({
        title: "Properties",
        schema: {
          properties: {
            timeout: {
              type: "number",
              default: 5000,
              description: "Request timeout",
              minimum: 0,
              maximum: 60000,
            },
            code: { type: "string", pattern: "^[A-Z]+$" },
            email: { type: "string", format: "email" },
          },
        },
        t: enUS,
        labels: { timeout: "Timeout", code: "Code", email: "Email" },
        typeFields: [
          { name: "timeout", type: "number", optional: false },
          { name: "code", type: "string", optional: false },
          { name: "email", type: "string", optional: true },
        ],
      });

      // Type is the TS type, enriched with schema min/max, pattern, format.
      expect(section).toContain("<td>number [min: 0, max: 60000]</td>");
      expect(section).toContain("<td>string [pattern: `^[A-Z]+$`]</td>");
      expect(section).toContain("<td>string [format: email]</td>");
      // default + description come from the schema
      expect(section).toContain("<code>5000</code>");
      expect(section).toContain("Request timeout");
      // labels applied → label column present, label cell before property cell
      expect(section).toContain("<th>Label</th>");
      expect(section).toContain("<td>Timeout</td>");
      expect(section.indexOf("<th>Label</th>")).toBeLessThan(
        section.indexOf("<th>Property</th>"),
      );
    });

    it("prefers the TS type over the schema type/enum for the matching field", () => {
      const section = generateSchemaSection({
        title: "Properties",
        schema: {
          properties: {
            mode: { type: "string", enum: ["a", "b"], description: "the mode" },
          },
        },
        t: enUS,
        typeFields: [{ name: "mode", type: '"a" | "b"', optional: false }],
      });

      // TS union wins; the schema enum is NOT appended (already in the union)
      expect(section).toContain('<td>"a" | "b"</td>');
      expect(section).not.toContain("(a, b)");
      // but the schema description still enriches
      expect(section).toContain("the mode");
    });

    it("enriches a type-driven config section end-to-end via generateHelpDoc", () => {
      const doc = generateHelpDoc(
        {
          type: "n",
          configSchema: {
            properties: {
              retries: {
                type: "number",
                default: 3,
                minimum: 1,
                description: "How many times to retry",
              },
            },
          },
        },
        { configs: { retries: "Retries" } },
        enUS,
        undefined,
        ioTypes({
          config: role("{ retries: number }", [
            { name: "retries", type: "number" },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).toContain("<td>Retries</td>");
      expect(doc).toContain("<td>number [min: 1]</td>");
      expect(doc).toContain("<code>3</code>");
      expect(doc).toContain("How many times to retry");
    });
  });

  // (e) i18n: the Settings and Complete section TITLES resolve for every locale.
  describe("(e) i18n — Settings & Complete titles resolve for every locale", () => {
    const LOCALES = [
      "en-US",
      "de",
      "es-ES",
      "fr",
      "ko",
      "pt-BR",
      "ru",
      "ja",
      "zh-CN",
      "zh-TW",
    ] as const;

    it.each(LOCALES)("resolves both section titles for %s", (locale) => {
      const t = getHelpTranslations(locale);

      // Neither translation key is missing (which would stringify to "undefined").
      expect(String(t.sections.settings)).not.toBe("undefined");
      expect(String(t.sections.complete)).not.toBe("undefined");

      const doc = generateHelpDoc(
        { type: "n" },
        {},
        t,
        undefined,
        ioTypes({
          settings: role("{ apiKey: string }", [
            { name: "apiKey", type: "string" },
          ]),
          complete: role("{ done: boolean }", [
            { name: "done", type: "boolean" },
          ]),
        }),
      );

      expect(doc).toContain(`<h3>${t.sections.settings}</h3>`);
      expect(doc).toContain(`<h3>${t.sections.complete}</h3>`);
      // Guard against a missing key ever rendering literally as a heading.
      expect(doc).not.toContain("<h3>undefined</h3>");
    });
  });

  // (f) Fallback: with nodeTypes undefined (e.g. dev, no node-types.json), the
  // config/credentials/settings sections still render from their schemas. Input
  // and output sections are type-only — they have no schema fallback.
  describe("(f) schema-driven fallback for config/credentials/settings", () => {
    const nodeClass = {
      type: "n",
      configSchema: {
        properties: {
          host: { type: "string", default: "localhost" },
          url: { type: "string" },
        },
        required: ["url"],
      },
      credentialsSchema: {
        properties: { apiKey: { type: "string", format: "password" } },
      },
    };

    it("passing nodeTypes: undefined is identical to omitting the argument", () => {
      const withUndefined = generateHelpDoc(
        nodeClass,
        { configs: { host: "Host" } },
        enUS,
        undefined,
        undefined,
      );
      const withoutArg = generateHelpDoc(
        nodeClass,
        { configs: { host: "Host" } },
        enUS,
      );
      expect(withUndefined).toBe(withoutArg);
    });

    it("renders config/credentials from schema, but no type-only Input/Output", () => {
      const doc = generateHelpDoc(
        nodeClass,
        { configs: { host: "Host" } },
        enUS,
        undefined,
        undefined,
      );

      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).toContain("<h3>Credentials</h3>");
      // Type column comes from the schema (no TS types provided)
      expect(doc).toContain("<td>host</td>");
      expect(doc).toContain("<td>string</td>");
      // Input/Output are type-driven only — without nodeTypes, no such sections.
      expect(doc).not.toContain("<h3>Input</h3>");
      expect(doc).not.toContain("<h3>Output</h3>");
      // No Complete section without nodeTypes.complete
      expect(doc).not.toContain("Complete");
    });
  });

  // (e) Capabilities table — system features after the Properties table.
  describe("(e) Capabilities table", () => {
    it("renders lifecycle ports + custom-output flags for an IO node", () => {
      const doc = generateHelpDoc(
        {
          type: "n",
          inputs: 1,
          outputs: 1,
          // config exposes both per-port output settings \u2192 flags are true
          configSchema: {
            properties: {
              outputContextModes: { type: "object" },
              outputReturnProperties: { type: "object" },
            },
          },
        },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ text: string }", [{ name: "text", type: "string" }]),
        }),
      );
      expect(doc).toContain("<h3>Capabilities</h3>");
      expect(doc).toContain(
        "<tr><td>Lifecycle ports</td><td>error, complete, status</td></tr>",
      );
      expect(doc).toContain(
        "<tr><td>Custom Output Context</td><td>true</td></tr>",
      );
      expect(doc).toContain(
        "<tr><td>Custom Output Property</td><td>true</td></tr>",
      );
      // No port-count or validation rows.
      expect(doc).not.toContain("Input ports");
      expect(doc).not.toContain("Output ports");
      expect(doc).not.toContain("<td>Validation</td>");
      // Comes after the user Properties table, before Input.
      expect(doc.indexOf("Capabilities")).toBeLessThan(
        doc.indexOf("<h3>Input</h3>"),
      );
    });

    it("reports false custom-output flags when the config omits them", () => {
      const doc = generateHelpDoc(
        { type: "n", inputs: 1, outputs: 1 },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ a: string }", [{ name: "a", type: "string" }]),
        }),
      );
      expect(doc).toContain(
        "<tr><td>Custom Output Context</td><td>false</td></tr>",
      );
      expect(doc).toContain(
        "<tr><td>Custom Output Property</td><td>false</td></tr>",
      );
    });

    it("omits Capabilities for a config node (no ports)", () => {
      const doc = generateHelpDoc(
        {
          type: "c",
          category: "config",
          configSchema: { properties: { host: { type: "string" } } },
        },
        {},
        enUS,
      );
      expect(doc).not.toContain("<h3>Capabilities</h3>");
    });

    it("localizes the row labels", () => {
      const doc = generateHelpDoc(
        { type: "n", inputs: 1, outputs: 1 },
        {},
        getHelpTranslations("de"),
        undefined,
        ioTypes({
          input: role("{ a: string }", [{ name: "a", type: "string" }]),
        }),
      );
      expect(doc).toContain("<h3>Funktionen</h3>");
      expect(doc).toContain("<td>Lebenszyklus-Ports</td>");
      expect(doc).toContain("<td>Angepasster Ausgabekontext</td>");
      // Values stay canonical identifiers.
      expect(doc).toContain("<td>error, complete, status</td>");
    });
  });
});
