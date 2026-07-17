import { describe, it, expect } from "vitest";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import {
  CONFIG_DEFAULTS,
  mergeConfigDefaults,
} from "@/sdk/lib/server/schemas/config-defaults";

// The default value AJV/the editor should see for a given key when the author
// does not override it.
const defaultOf = (
  schema: { properties?: Record<string, unknown> },
  key: string,
) => (schema.properties?.[key] as { default?: unknown } | undefined)?.default;

describe("mergeConfigDefaults", () => {
  // Every built-in field an IONode carries, whether or not it declares them.
  // (The flat-record message model retired `outputReturnProperties` and
  // `inputRoot` — the record has no envelope to re-key or re-root.)
  const IO_NODE_KEYS = [
    "name",
    "errorPort",
    "completePort",
    "statusPort",
    "outputContextModes",
    "inputSchema",
    "outputSchemas",
    "validateInput",
    "validateOutputs",
  ];

  it("spreads every built-in field into a provided schema, keeping the author's own", () => {
    const author = defineSchema(
      { query: SchemaType.String({ default: "" }) },
      { $id: "soql:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:soql:config");

    // Author field survives...
    expect(Object.keys(merged.properties)).toContain("query");
    // ...and every built-in field is now present without the node declaring it.
    for (const key of IO_NODE_KEYS) {
      expect(Object.keys(merged.properties)).toContain(key);
    }
  });

  it("uses the built-in defaults when the author does not declare the field", () => {
    const author = defineSchema(
      { query: SchemaType.String({ default: "" }) },
      { $id: "soql:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:soql:config");

    // Lifecycle ports + input validation default OFF; per-port maps default
    // empty — an empty outputContextModes map means every port merges.
    expect(defaultOf(merged, "errorPort")).toBe(false);
    expect(defaultOf(merged, "completePort")).toBe(false);
    expect(defaultOf(merged, "statusPort")).toBe(false);
    expect(defaultOf(merged, "outputContextModes")).toEqual({});
    expect(defaultOf(merged, "validateInput")).toBe(false);
    expect(defaultOf(merged, "validateOutputs")).toEqual({});
  });

  it("lets an author declaration override the built-in default (declaring only changes the default)", () => {
    const author = defineSchema(
      {
        // Author wants the error port ON by default and port 0 starting a
        // fresh record instead of merging onto the incoming one.
        errorPort: SchemaType.Boolean({ default: true }),
        outputContextModes: SchemaType.OutputContextModes({
          default: { 0: "reset" },
        }),
      },
      { $id: "loud-node:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:loud-node:config");

    expect(defaultOf(merged, "errorPort")).toBe(true);
    expect(defaultOf(merged, "outputContextModes")).toEqual({ 0: "reset" });
    // The ones it didn't touch keep the built-in default.
    expect(defaultOf(merged, "completePort")).toBe(false);
  });

  it("keeps redeclared built-in fields out of required[] (declaring only changes the default)", () => {
    const author = defineSchema(
      {
        // Redeclaring `name` (a built-in) — TypeBox lists it in required[], but a
        // blank name is normal in Node-RED, so the merge must strip it back out.
        name: SchemaType.String({ default: "", description: "Node label" }),
        query: SchemaType.String({ default: "" }),
      },
      { $id: "soql:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:soql:config");

    // The author's own non-Optional field stays required; the redeclared
    // built-in does not, and no built-in leaks into required[].
    expect(merged.required).toEqual(["query"]);
    for (const key of IO_NODE_KEYS) {
      expect(merged.required ?? []).not.toContain(key);
    }
  });

  it("drops required[] entirely when the author declares only built-in fields", () => {
    const author = defineSchema(
      { errorPort: SchemaType.Boolean({ default: true }) },
      { $id: "loud:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:loud:config");

    // errorPort is a built-in → stripped from required[]; nothing else is
    // required, so the array is dropped rather than left empty.
    expect(merged.required).toBeUndefined();
  });

  it("handles an all-Optional author schema that carries no required[] at all", () => {
    const author = defineSchema(
      { note: SchemaType.Optional(SchemaType.String({ default: "" })) },
      { $id: "opt:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:opt:config");

    // TypeBox emits no `required` when every field is Optional; the merge must
    // tolerate that (no array to filter) and still produce no required[].
    expect(merged.required).toBeUndefined();
    expect(Object.keys(merged.properties)).toContain("note");
  });

  it("keeps the author's $id (the merged schema is the only one compiled for that type)", () => {
    const author = defineSchema(
      { query: SchemaType.String({ default: "" }) },
      { $id: "soql:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:soql:config");

    expect(merged.$id).toBe("soql:config");
  });

  it("falls back to the provided id and ships all built-in fields when the node has no config schema", () => {
    const merged = mergeConfigDefaults(undefined, "nrg:bare-node:config");

    expect(merged.$id).toBe("nrg:bare-node:config");
    for (const key of IO_NODE_KEYS) {
      expect(Object.keys(merged.properties)).toContain(key);
    }
  });

  it("exposes the same field set through CONFIG_DEFAULTS", () => {
    expect(Object.keys(CONFIG_DEFAULTS).sort()).toEqual(
      [...IO_NODE_KEYS].sort(),
    );
  });

  it("outputContextModes allows merge/reset plus the legacy passthrough alias", () => {
    const merged = mergeConfigDefaults(undefined, "nrg:modes:config");

    // `Record<number, mode>` → TypeBox emits `patternProperties` keyed by the
    // numeric-index pattern; the per-port value is the mode union. `passthrough`
    // stays ACCEPTED so flows saved before the merge rename still validate, but
    // it is only an alias — the runtime resolves it to `merge`.
    // narrowing the loosely-typed generated TypeBox schema shape
    const modes = merged.properties.outputContextModes as {
      patternProperties?: Record<string, { anyOf?: { const?: unknown }[] }>;
    };
    const perPort = Object.values(modes.patternProperties ?? {})[0];
    const literals = (perPort?.anyOf ?? []).map(
      (literal: { const?: unknown }) => literal.const,
    );
    expect(literals).toEqual(["merge", "reset", "passthrough"]);
  });
});
