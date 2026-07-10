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

  // (b) Output ports: every port renders as one row (Port | Type) under a single
  // "Outputs" heading — object shape inline, no per-field explosion.
  describe("(b) Output ports", () => {
    it("single object output → one Outputs table row with the shape inline", () => {
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

      // Always the plural "Outputs" heading, even for a single port.
      expect(doc).toContain("<h3>Outputs</h3>");
      // One row: the port (unnamed → "Port 1") and its object shape inline.
      expect(doc).toContain(
        "<tr><td>Port 1</td><td>{ result: string }</td></tr>",
      );
      // NOT exploded into a per-field property table.
      expect(doc).not.toContain("<td>result</td>");
    });

    it("positional tuple ports → one Outputs table, a row per port", () => {
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
      expect(doc).toContain("<tr><td>Port 1</td><td>{ a: string }</td></tr>");
      expect(doc).toContain("<tr><td>Port 2</td><td>{ b: number }</td></tr>");
      // No per-port sub-headings anymore.
      expect(doc).not.toContain("<h4>");
    });

    it("named record ports → rows keyed by port name", () => {
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
      // Port name in the Port cell; the object shape inline in the Type cell.
      expect(doc).toContain(
        "<tr><td>success</td><td>{ payload: string }</td></tr>",
      );
      expect(doc).toContain(
        "<tr><td>failure</td><td>{ error: string }</td></tr>",
      );
      expect(doc).not.toContain("Port 1"); // named, not generic "Port N"
    });

    it("a single primitive-typed port → one Outputs row with the type inline", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [{ index: 0, role: role("string", []) }],
        }),
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain("<tr><td>Port 1</td><td>string</td></tr>");
    });

    it("mixed primitive + object positional ports share one Outputs table", () => {
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
      expect(doc).toContain('<tr><td>Port 1</td><td>"ok" | "fail"</td></tr>');
      expect(doc).toContain("<tr><td>Port 2</td><td>{ b: number }</td></tr>");
      expect(doc).not.toContain("<h4>");
    });

    // The port's domain label (outputLabels[i]) is surfaced, and an object
    // value is captioned so it reads as ONE output, not many.
    it("shows the outputLabels label in the Port cell with the object shape inline", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputLabels: ["Query results"] },
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              index: 0,
              role: role(
                "{ records: Array<Record<string, unknown>>; totalSize: number }",
                [
                  { name: "records", type: "Array<Record<string, unknown>>" },
                  { name: "totalSize", type: "number" },
                ],
              ),
            },
          ],
        }),
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      // the domain label is the Port cell; the object shape is inline & escaped
      expect(doc).toContain(
        "<td>Query results</td><td>{ records: Array&lt;Record&lt;string, unknown&gt;&gt;; totalSize: number }</td>",
      );
      // NOT exploded into per-field rows
      expect(doc).not.toContain("<td>records</td>");
    });

    it("shows the port label for a union output with the union inline", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputLabels: ["Operation result"] },
        enUS,
        undefined,
        ioTypes({
          outputs: [
            { index: 0, role: role("SaveResult | Array<SaveResult>", []) },
          ],
        }),
      );

      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).toContain(
        "<td>Operation result</td><td>SaveResult | Array&lt;SaveResult&gt;</td>",
      );
    });

    it("a nameless tuple port uses its outputLabels entry as the Port cell", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputLabels: ["Success", "Failure"] },
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
      expect(doc).toContain("<tr><td>Success</td><td>{ a: string }</td></tr>");
      expect(doc).toContain("<tr><td>Failure</td><td>{ b: number }</td></tr>");
      expect(doc).not.toContain("Port 1");
    });

    it("a named port prefers its outputLabels label over the raw name in the Port cell", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputLabels: ["On success", "On failure"] },
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              name: "success",
              index: 0,
              role: role("{ a: string }", [{ name: "a", type: "string" }]),
            },
            {
              name: "failure",
              index: 1,
              role: role("{ b: number }", [{ name: "b", type: "number" }]),
            },
          ],
        }),
      );

      expect(doc).toContain("<td>On success</td>");
      expect(doc).toContain("<td>On failure</td>");
    });
  });

  // (c) Complete section: object → table, primitive/union → one-row Type table,
  // absent when complete is undefined.
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

    it("primitive/union complete → a one-row Type table", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({ complete: role('"ok" | "fail"', []) }),
      );

      expect(doc).toContain("<h3>Complete</h3>");
      expect(doc).toContain('<tr><td>"ok" | "fail"</td></tr>');
      expect(doc).toContain("<th>Type</th>");
    });

    it("a vacuous (`unknown`) output renders no section", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({ outputs: [{ index: 0, role: role("unknown", []) }] }),
      );
      expect(doc).not.toContain("<h3>Output</h3>");
    });

    it("input/output tables have no Description column", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
          outputs: [
            {
              index: 0,
              role: role("{ ok: boolean }", [{ name: "ok", type: "boolean" }]),
            },
          ],
        }),
      );
      expect(doc).toContain("<h3>Input</h3>");
      expect(doc).toContain("<h3>Outputs</h3>");
      expect(doc).not.toContain(">Description</th>");
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
      // Built-in Error/Status sections are gated on nodeTypes.kind === "io".
      expect(doc).not.toContain("<h3>Error</h3>");
      expect(doc).not.toContain("<h3>Status</h3>");
    });
  });

  // (g) Input port label, the output envelope note, built-in error/status port
  // sections, and heading/description escaping.
  describe("(g) input label, envelope note, built-in ports, escaping", () => {
    it("surfaces the inputLabels label and renders a primitive input as a Type table", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { inputLabels: ["Query input"] },
        enUS,
        undefined,
        ioTypes({ input: role("string", []) }),
      );

      expect(doc).toContain("<h3>Input</h3>");
      expect(doc).toContain("<p><strong>Query input</strong></p>");
      // A non-object input used to render nothing (schema-only path) — now a
      // one-row Type table.
      expect(doc).toContain("<th>Type</th>");
      expect(doc).toContain("<tr><td>string</td></tr>");
    });

    it("an object input renders a field table with its per-field labels", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { inputLabels: ["Records"], input: { payload: "Record data" } },
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Input</h3>");
      expect(doc).toContain("<p><strong>Records</strong></p>");
      expect(doc).toContain("<td>Record data</td>"); // per-field label
      // Input keeps the field table (unlike outputs, which render inline).
      expect(doc).toContain("<td>payload</td>");
    });

    it("appends the output envelope note when outputs render", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              index: 0,
              role: role("{ ok: boolean }", [{ name: "ok", type: "boolean" }]),
            },
          ],
        }),
      );
      expect(doc).toContain(enUS.notes.outputEnvelope);
    });

    it("does not append the envelope note when there are no outputs", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          config: role("{ host: string }", [{ name: "host", type: "string" }]),
        }),
      );
      expect(doc).not.toContain(enUS.notes.outputEnvelope);
    });

    it("renders built-in Error and Status port sections for io nodes", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          config: role("{ host: string }", [{ name: "host", type: "string" }]),
        }),
      );

      expect(doc).toContain("<h3>Error</h3>");
      expect(doc).toContain("<h3>Status</h3>");
      // The fixed shapes name the error block + provenance keys.
      expect(doc).toContain("error:");
      expect(doc).toContain("status:");
      expect(doc).toContain("source");
    });

    it("does NOT render Error/Status for config nodes (no ports)", () => {
      const doc = generateHelpDoc({ type: "n" }, {}, enUS, undefined, {
        type: "n",
        kind: "config",
        config: role("{ host: string }", [{ name: "host", type: "string" }]),
      });

      expect(doc).toContain("<h3>Properties</h3>");
      expect(doc).not.toContain("<h3>Error</h3>");
      expect(doc).not.toContain("<h3>Status</h3>");
    });

    it("escapes a port heading carrying HTML-special characters", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputLabels: ["A<B>", "Ok"] },
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

      // The label goes in the Port cell and must be HTML-escaped.
      expect(doc).toContain("<td>A&lt;B&gt;</td>");
      expect(doc).not.toContain("<td>A<B></td>");
    });

    it("escapes the node description", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { description: "records < 200 & counting" },
        enUS,
        undefined,
        ioTypes({}),
      );
      expect(doc).toContain("<p>records &lt; 200 &amp; counting</p>");
      expect(doc).not.toContain("records < 200 & counting");
    });
  });

  // (h) The node author's default input/output data-validation schemas
  // (inputSchema/outputSchemas config defaults) enrich the type-driven tables.
  describe("(h) input/output validation-schema enrichment", () => {
    it("enriches the Input table from the default inputSchema (constraints, description, note)", () => {
      const doc = generateHelpDoc(
        {
          type: "n",
          configSchema: {
            properties: {
              inputSchema: {
                default: JSON.stringify({
                  type: "object",
                  properties: {
                    payload: {
                      type: "string",
                      minLength: 3,
                      description: "The record id",
                    },
                  },
                  required: ["payload"],
                }),
              },
            },
          },
        },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Input</h3>");
      // TS type kept, enriched with the schema constraint
      expect(doc).toContain("<td>string [min: 3]</td>");
      // the schema supplied a description → Description column appears
      expect(doc).toContain(">Description</th>");
      expect(doc).toContain("<td>The record id</td>");
      // the opt-in / overridable note
      expect(doc).toContain(enUS.notes.dataValidation);
    });

    it("does NOT enrich Outputs from an outputSchemas default (outputs render inline)", () => {
      const doc = generateHelpDoc(
        {
          type: "n",
          configSchema: {
            properties: {
              outputSchemas: {
                default: {
                  0: JSON.stringify({
                    type: "object",
                    properties: {
                      total: {
                        type: "number",
                        minimum: 0,
                        description: "row count",
                      },
                    },
                  }),
                },
              },
            },
          },
        },
        {},
        enUS,
        undefined,
        ioTypes({
          outputs: [
            {
              index: 0,
              role: role("{ total: number }", [
                { name: "total", type: "number" },
              ]),
            },
          ],
        }),
      );

      // The port renders as one inline-type row; the output schema's constraints,
      // description, and the data-validation note are NOT surfaced (output-side
      // enrichment was dropped — only Input enriches).
      expect(doc).toContain(
        "<tr><td>Port 1</td><td>{ total: number }</td></tr>",
      );
      expect(doc).not.toContain("[min: 0]");
      expect(doc).not.toContain("row count");
      expect(doc).not.toContain(enUS.notes.dataValidation);
    });

    it("adds no data-validation note (or Description column) without a default schema", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Input</h3>");
      expect(doc).not.toContain(enUS.notes.dataValidation);
      expect(doc).not.toContain(">Description</th>");
    });

    it("ignores an empty or invalid inputSchema default", () => {
      const empty = generateHelpDoc(
        {
          type: "n",
          configSchema: { properties: { inputSchema: { default: "" } } },
        },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
        }),
      );
      expect(empty).not.toContain(enUS.notes.dataValidation);

      const bad = generateHelpDoc(
        {
          type: "n",
          configSchema: {
            properties: { inputSchema: { default: "not json{" } },
          },
        },
        {},
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
        }),
      );
      expect(bad).not.toContain(enUS.notes.dataValidation);
    });
  });
});
