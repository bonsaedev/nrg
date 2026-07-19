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
      expect(doc).toContain("<h3>Configuration</h3>");
      expect(doc).toContain("<td>host</td><td>string</td>");
      expect(doc).toContain("<h3>Settings</h3>");
      expect(doc).toContain("<td>region</td><td>string</td>");
    });

    it("renders a primitive/union Settings role as a one-row Type table", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({ settings: role('"debug" | "info" | "warn"', []) }),
      );

      expect(doc).toContain("<h3>Settings</h3>");
      expect(doc).toContain('<tr><td>"debug" | "info" | "warn"</td></tr>');
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

    // The port's label (outputs[i].label) is surfaced in the Port cell, and the
    // object value is shown inline so it reads as ONE output, not many.
    it("shows the outputs label in the Port cell with the object shape inline", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputs: [{ label: "Query results" }] },
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
        { outputs: [{ label: "Operation result" }] },
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

    it("a nameless tuple port uses its outputs entry as the Port cell", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputs: [{ label: "Success" }, { label: "Failure" }] },
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

    it("a named port prefers its outputs label over the raw name in the Port cell", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {
          outputs: {
            success: { label: "On success" },
            failure: { label: "On failure" },
          },
        },
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

  // (c) Input port, the Description column, vacuous ports, and the ABSENCE of any
  // lifecycle (Complete/Error/Status) section — that documentation was removed and
  // is being redesigned separately.
  describe("(c) Input, descriptions, and vacuous ports", () => {
    it("renders the input as ONE row (Port | Type), never per-property", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { input: { label: "Request" } },
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string; url: string }", [
            { name: "payload", type: "string" },
            { name: "url", type: "string" },
          ]),
        }),
      );
      expect(doc).toContain("<h3>Input</h3>");
      expect(doc).toContain(
        "<tr><td>Request</td><td>{ payload: string; url: string }</td></tr>",
      );
      // NOT exploded into per-field rows.
      expect(doc).not.toContain("<td>payload</td>");
      expect(doc).not.toContain("<td>url</td>");
    });

    it("uses the section name as the input Port cell when no label is given", () => {
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
      expect(doc).toContain(
        "<tr><td>Input</td><td>{ payload: string }</td></tr>",
      );
    });

    it("adds a Description column with the port descriptions from the label file", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {
          input: { label: "Request", description: "What comes in" },
          outputs: { out: { label: "Result", description: "What goes out" } },
        },
        enUS,
        undefined,
        ioTypes({
          input: role("{ payload: string }", [
            { name: "payload", type: "string" },
          ]),
          outputs: [
            {
              name: "out",
              index: 0,
              role: role("{ ok: boolean }", [{ name: "ok", type: "boolean" }]),
            },
          ],
        }),
      );
      expect(doc).toContain("<th>Description</th>");
      expect(doc).toContain("What comes in");
      expect(doc).toContain("What goes out");
    });

    it("omits the Description column when no port has a description", () => {
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

    it("a vacuous (`unknown`) output renders no section", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({ outputs: [{ index: 0, role: role("unknown", []) }] }),
      );
      expect(doc).not.toContain("<h3>Outputs</h3>");
    });

    it("renders no lifecycle (Complete/Error/Status) section", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        {},
        enUS,
        undefined,
        ioTypes({
          config: role("{ host: string }", [{ name: "host", type: "string" }]),
          outputs: [
            {
              index: 0,
              role: role("{ ok: boolean }", [{ name: "ok", type: "boolean" }]),
            },
          ],
        }),
      );
      expect(doc).toContain("<h3>Configuration</h3>");
      expect(doc).not.toContain("Lifecycle");
      expect(doc).not.toContain("<td>Complete</td>");
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
        labels: {
          timeout: { label: "Timeout" },
          code: { label: "Code" },
          email: { label: "Email" },
        },
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
        { configs: { retries: { label: "Retries" } } },
        enUS,
        undefined,
        ioTypes({
          config: role("{ retries: number }", [
            { name: "retries", type: "number" },
          ]),
        }),
      );

      expect(doc).toContain("<h3>Configuration</h3>");
      expect(doc).toContain("<td>Retries</td>");
      expect(doc).toContain("<td>number [min: 1]</td>");
      expect(doc).toContain("<code>3</code>");
      expect(doc).toContain("How many times to retry");
    });
  });

  // (e) i18n: the Settings / Input / Outputs section TITLES resolve for every
  // locale.
  describe("(e) i18n — section titles resolve for every locale", () => {
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

    it.each(LOCALES)("resolves the port/section titles for %s", (locale) => {
      const t = getHelpTranslations(locale);

      // No translation key is missing (which would stringify to "undefined").
      expect(String(t.sections.settings)).not.toBe("undefined");
      expect(String(t.sections.input)).not.toBe("undefined");
      expect(String(t.sections.outputs)).not.toBe("undefined");

      const doc = generateHelpDoc(
        { type: "n" },
        {},
        t,
        undefined,
        ioTypes({
          settings: role("{ apiKey: string }", [
            { name: "apiKey", type: "string" },
          ]),
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

      expect(doc).toContain(`<h3>${t.sections.settings}</h3>`);
      expect(doc).toContain(`<h3>${t.sections.input}</h3>`);
      expect(doc).toContain(`<h3>${t.sections.outputs}</h3>`);
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
        { configs: { host: { label: "Host" } } },
        enUS,
        undefined,
        undefined,
      );
      const withoutArg = generateHelpDoc(
        nodeClass,
        { configs: { host: { label: "Host" } } },
        enUS,
      );
      expect(withUndefined).toBe(withoutArg);
    });

    it("renders config/credentials from schema, but no type-only Input/Output", () => {
      const doc = generateHelpDoc(
        nodeClass,
        { configs: { host: { label: "Host" } } },
        enUS,
        undefined,
        undefined,
      );

      expect(doc).toContain("<h3>Configuration</h3>");
      expect(doc).toContain("<h3>Credentials</h3>");
      // Type column comes from the schema (no TS types provided)
      expect(doc).toContain("<td>host</td>");
      expect(doc).toContain("<td>string</td>");
      // Input/Output are type-driven only — without nodeTypes, no such sections.
      expect(doc).not.toContain("<h3>Input</h3>");
      expect(doc).not.toContain("<h3>Outputs</h3>");
    });
  });

  // (g) The output envelope note and heading/label escaping.
  describe("(g) envelope note and escaping", () => {
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

    it("escapes a port label carrying HTML-special characters", () => {
      const doc = generateHelpDoc(
        { type: "n" },
        { outputs: [{ label: "A<B>" }, { label: "Ok" }] },
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
});
