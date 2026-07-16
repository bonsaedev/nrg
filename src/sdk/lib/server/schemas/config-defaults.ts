import { SchemaType, type TObject, type TSchema } from "../../shared/schemas";

/**
 * The built-in config every IONode carries for free: a `name`, the three
 * lifecycle port toggles, the per-port return-property / context-mode maps, and
 * the data-validation controls. These render in the editor's Ports Settings
 * section on **every** IONode — a node does NOT have to declare them to get the
 * controls. Declaring one in the node's own `configSchema` only **overrides its
 * default here** (e.g. `errorPort` defaulting to `true`, or a non-`carry` context
 * mode); it is not what makes the control appear.
 *
 * Kept as a raw properties map (not a `defineSchema` object) so it can be spread
 * *under* an author schema's properties — see {@link mergeConfigDefaults}. Every
 * field is a plain JSON type, so AJV needs no extra normalization.
 */
const CONFIG_DEFAULTS: Record<string, TSchema> = {
  name: SchemaType.String({ default: "", "x-nrg-form": { icon: "tag" } }),
  errorPort: SchemaType.Boolean({
    default: false,
    description: "Enable a dedicated output port for error messages.",
  }),
  completePort: SchemaType.Boolean({
    default: false,
    description: "Enable a dedicated output port for completion notifications.",
  }),
  statusPort: SchemaType.Boolean({
    default: false,
    description: "Enable a dedicated output port for status updates.",
  }),
  outputReturnProperties: SchemaType.OutputReturnProperties(),
  outputContextModes: SchemaType.OutputContextModes(),
  // Which message property input() reads from. "" (default) = the whole message
  // (default Node-RED behavior); a property name (e.g. "output") rebuilds the
  // message rooted there before input() runs. See SchemaType.InputRoot.
  inputRoot: SchemaType.InputRoot(),
  // Data validation is a built-in control on every IONode: the Validate Data
  // toggles and the schema editors always render. A node author declaring these
  // only seeds a default schema / default on-state; it is not what surfaces the
  // control. `inputSchema`/`outputSchemas` are the JSON-Schema strings; the
  // `validate*` flags are the per-input / per-port on switches.
  inputSchema: SchemaType.InputSchema(),
  outputSchemas: SchemaType.OutputSchemas(),
  validateInput: SchemaType.Boolean({
    default: false,
    description:
      "Validate each incoming message against the input schema before input() runs.",
  }),
  validateOutputs: SchemaType.Record(
    SchemaType.Number(),
    SchemaType.Boolean(),
    {
      default: {},
      description:
        "Per-port flag (by output port index) to validate the sent value against that port's output schema.",
    },
  ),
};

/**
 * Merge the built-in config defaults **under** a node's own config schema: the
 * built-in fields come first and the author's properties are layered on top, so
 * an author-declared field (same key) wins and simply changes the default. The
 * result is the effective config schema the editor renders from and the build
 * derives `defaults` from.
 *
 * `$id` matters for AJV's schema cache — it must be unique per node type. We keep
 * the author's `$id` when present (the merged schema is the only one ever
 * compiled for that type; the raw author schema is never validated on its own),
 * and fall back to `fallbackId` for a node that ships no config schema at all.
 */
function mergeConfigDefaults(
  authorSchema: TObject | null | undefined,
  fallbackId: string,
): TObject {
  const authorProps = authorSchema?.properties ?? {};
  const properties = { ...CONFIG_DEFAULTS, ...authorProps };

  if (!authorSchema) {
    return {
      type: "object",
      properties,
      $id: fallbackId,
    } as unknown as TObject;
  }

  // A built-in field keeps its built-in (optional) contract even when an author
  // redeclares one: redeclaring only overrides its default — it never makes the
  // field required. TypeBox lists every non-`Optional` author property in
  // `required[]`, so a redeclared built-in (e.g. `name`) would otherwise gain a
  // `*` and a non-empty constraint that rejects an empty value — normal for
  // `name` in Node-RED. Strip the built-in keys back out of `required[]`.
  const builtinKeys = new Set(Object.keys(CONFIG_DEFAULTS));
  const required = (authorSchema.required ?? []).filter(
    (key) => !builtinKeys.has(key),
  );

  const merged = { ...authorSchema, properties } as TObject;
  if (required.length > 0) {
    (merged as { required?: string[] }).required = required;
  } else {
    delete (merged as { required?: string[] }).required;
  }
  return merged;
}

export { CONFIG_DEFAULTS, mergeConfigDefaults };
