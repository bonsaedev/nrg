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
  const IO_NODE_KEYS = [
    "name",
    "errorPort",
    "completePort",
    "statusPort",
    "outputReturnProperties",
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

    // Lifecycle ports + input validation default OFF; per-port maps default empty.
    expect(defaultOf(merged, "errorPort")).toBe(false);
    expect(defaultOf(merged, "completePort")).toBe(false);
    expect(defaultOf(merged, "statusPort")).toBe(false);
    expect(defaultOf(merged, "outputReturnProperties")).toEqual({});
    expect(defaultOf(merged, "outputContextModes")).toEqual({});
    expect(defaultOf(merged, "validateInput")).toBe(false);
    expect(defaultOf(merged, "validateOutputs")).toEqual({});
  });

  it("lets an author declaration override the built-in default (declaring only changes the default)", () => {
    const author = defineSchema(
      {
        // Author wants the error port ON by default and a non-carry context mode.
        errorPort: SchemaType.Boolean({ default: true }),
        outputContextModes: SchemaType.OutputContextModes({
          default: { 0: "trace" },
        }),
      },
      { $id: "loud-node:config" },
    );

    const merged = mergeConfigDefaults(author, "nrg:loud-node:config");

    expect(defaultOf(merged, "errorPort")).toBe(true);
    expect(defaultOf(merged, "outputContextModes")).toEqual({ 0: "trace" });
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
});
