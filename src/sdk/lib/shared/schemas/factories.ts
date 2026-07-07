import type {
  TSchema,
  TProperties,
  TString,
  TUnsafe,
  ObjectOptions,
  StringOptions,
  StringFormatOption,
} from "@sinclair/typebox";
import { Type as BaseType, Kind } from "@sinclair/typebox";
import type {
  Schema,
  NrgSchemaOptions,
  UnsafeBrand,
  ConfigNodeBrand,
  TNodeRef,
  TTypedInput,
} from "./types";
import { TypedInputSchema } from "./base";

// The seven JSON Schema primitive type names. Reimplemented locally rather than
// importing AJV's private `ajv/dist/compile/rules.js` — that deep path resolves
// only because AJV 8 ships no `exports` map, so a future AJV that adds one would
// break every consumer at load time (and this module is on the browser-safe
// shared authoring surface).
const JSON_TYPES = new Set([
  "null",
  "boolean",
  "object",
  "array",
  "number",
  "integer",
  "string",
]);
function isJSONType(value: unknown): boolean {
  return typeof value === "string" && JSON_TYPES.has(value);
}

/**
 * Creates a schema for a reference to a config node by its registered `type`.
 *
 * Pass the node `type` string at runtime and the config class as a *type-only*
 * generic: `SchemaType.NodeRef<BrokerConfig>("broker-config")`. In type position
 * a class name is its **instance type**, which is what `T` binds to — so `T` is
 * constrained to {@link ConfigNodeBrand} (declared on every `ConfigNode`
 * instance): `NodeRef<string>` or `NodeRef<{ host: string }>` is a compile error
 * while any real config class passes. Constraining via the shared brand keeps
 * this browser-safe module from importing the server `ConfigNode` type. The
 * generic is erased at compile time, so this never value-imports the config class
 * and stays safe to evaluate in the browser/editor bundle. The runtime payload is
 * identical on both planes.
 *
 * Type resolution is per-plane and unchanged: on the server `this.config.<ref>`
 * resolves to the referenced node *instance* (`BrokerConfig`, with all its
 * props/methods); on the client the same field resolves to the node id `string`.
 * Omitting the generic leaves the ref typed as the opaque {@link ConfigNodeBrand}
 * (the default), NOT `unknown` — annotate the field yourself if you need a
 * concrete type on an untyped ref. (Pass the class name, not `typeof Class` — the
 * constructor form is not accepted.)
 */
function NodeRef<T extends ConfigNodeBrand = ConfigNodeBrand>(
  type: string,
  options?: NrgSchemaOptions,
): TNodeRef<T> {
  return {
    ...BaseType.String({
      description: options?.description || `Reference to ${type}`,
    }),
    // `...options` first so user options (description, x-nrg-form, …) apply, but
    // the framework keys below win — a caller can't clobber `format`/
    // `x-nrg-node-type`/`Kind` and silently break NodeRef resolution.
    ...options,
    format: "node-id",
    "x-nrg-node-type": type,
    [Kind]: "NodeRef",
  } as unknown as TNodeRef<T>;
}

/**
 * Creates a schema for a Node-RED TypedInput (value + type pair).
 *
 * A default `type` is always set (the editor's TypedInput renders broken with no
 * type). When the field restricts its types via `x-nrg-form.typedInputTypes` —
 * a subset of {@link TYPED_INPUT_TYPES} and/or custom editor-registered types —
 * the default type must be one of them (an explicit default outside that set is
 * rejected, and a missing default falls back to `str` when allowed else the
 * first listed type). When types are unrestricted, the full set (standard plus
 * any custom types) isn't known here, so an explicit default type is trusted
 * as-is and a missing one defaults to `str`.
 */
function TypedInput<T = unknown>(options?: NrgSchemaOptions): TTypedInput<T> {
  const opts = (options ?? {}) as {
    default?: { type?: string; value?: unknown };
    "x-nrg-form"?: { typedInputTypes?: string[] };
  };
  const restrictedTypes = opts["x-nrg-form"]?.typedInputTypes;
  if (restrictedTypes && restrictedTypes.length === 0) {
    throw new Error(
      "SchemaType.TypedInput: typedInputTypes must list at least one type.",
    );
  }
  const explicitType = opts.default?.type;
  if (
    restrictedTypes &&
    explicitType !== undefined &&
    !restrictedTypes.includes(explicitType)
  ) {
    throw new Error(
      `SchemaType.TypedInput: default type "${explicitType}" is not one of its ` +
        `typedInputTypes [${restrictedTypes.join(", ")}].`,
    );
  }
  const defaultType =
    explicitType ??
    (restrictedTypes
      ? restrictedTypes.includes("str")
        ? "str"
        : restrictedTypes[0]
      : "str");

  return {
    ...TypedInputSchema,
    // `...options` first; the framework keys below win (see NodeRef).
    ...options,
    default: {
      ...(TypedInputSchema as { default?: Record<string, unknown> }).default,
      ...opts.default,
      type: defaultType,
    },
    "x-nrg-typed-input": true,
    [Kind]: "TypedInput",
  } as unknown as TTypedInput<T>;
}

/**
 * String `format` values NRG validates at runtime. TypeBox's own
 * `StringFormatOption` covers the standard JSON Schema formats (`email`,
 * `date-time`, `uri`, `uuid`, `ipv4`, …); this adds the ajv-formats (full mode)
 * that TypeBox omits but `addFormats()` in `sdk/lib/shared/validator.ts` registers —
 * notably `password`, which drives the editor's password input — plus NRG's own
 * `node-id` (registered in the shared validation modules). The trailing `({} & string)`
 * inside `StringFormatOption` still accepts any string, so the extra literals
 * only enrich autocomplete; they never restrict what compiles.
 */
type NrgStringFormat =
  | StringFormatOption
  | "node-id"
  | "password"
  | "byte"
  | "binary"
  | "url"
  | "duration"
  | "iso-time"
  | "iso-date-time"
  | "json-pointer-uri-fragment";

interface NrgStringOptions extends Omit<StringOptions, "format"> {
  format?: NrgStringFormat;
}

/**
 * String schema builder. Identical to TypeBox's `Type.String` at runtime, but
 * its `format` option also autocompletes the ajv-formats NRG registers (e.g.
 * `password`) on top of TypeBox's built-in list, so suggestions match what the
 * validator actually enforces.
 */
function NrgString(options?: NrgStringOptions): TString {
  return BaseType.String(options as StringOptions);
}

/**
 * Declares the `outputReturnProperties` config map: the return property for
 * each output port, keyed by port index. A missing entry falls back to the
 * built-in `output` key. The node author supplies per-port defaults here;
 * declaring it also exposes an editable Return Property column per port in the
 * editor so flow authors can override them. Without it, every output uses
 * `output`.
 *
 * @example
 * ```ts
 * // port 0 defaults to `result`; every other port falls back to `output`
 * outputReturnProperties: SchemaType.OutputReturnProperties({
 *   default: { 0: "result" },
 * }),
 * ```
 */
function OutputReturnProperties(
  options?: NrgSchemaOptions & { default?: Record<number, string> },
) {
  return BaseType.Record(
    BaseType.Number(),
    BaseType.String({ pattern: "^[A-Za-z_$][A-Za-z0-9_$]*$" }),
    {
      description:
        "Per-port return property, keyed by output port index. A missing entry falls back to `output`.",
      default: {},
      ...options,
    },
  );
}

/**
 * Declares the `outputContextModes` config map: how each output port carries the
 * incoming message's context, keyed by port index. Declaring it exposes an
 * editable Context Mode column in the editor — but only for ports the author
 * gives a default; a port without a default stays locked to `carry`. Without
 * this declaration every port resolves to `carry` and the column is hidden.
 *
 * @example
 * ```ts
 * // port 0 is configurable (seeded to `trace`); every other port is `carry`
 * outputContextModes: SchemaType.OutputContextModes({
 *   default: { 0: "trace" },
 * }),
 * ```
 */
function OutputContextModes(
  options?: NrgSchemaOptions & {
    default?: Record<number, "carry" | "trace" | "reset">;
  },
) {
  return BaseType.Record(
    BaseType.Number(),
    BaseType.Union([
      BaseType.Literal("carry"),
      BaseType.Literal("trace"),
      BaseType.Literal("reset"),
    ]),
    {
      description:
        "Per-port context mode, keyed by output port index. A missing entry falls back to `carry`.",
      default: {},
      ...options,
    },
  );
}

/**
 * Declares the `outputSchemas` config map: per-port DATA-VALIDATION schema
 * overrides, keyed by output port index, as JSON-Schema strings a flow author
 * edits in the editor (Monaco). Declaring it exposes an editable Schema column
 * in the Outputs table — but only for ports the author gives a default (a port
 * absent from `default` is not overridable, so its button stays disabled).
 * Validation is opt-in and orthogonal to topology/types (which come from the
 * generics); this only affects runtime data validation when Validate Data is on.
 *
 * @example
 * ```ts
 * // port 0 is overridable, seeded with an author default schema
 * outputSchemas: SchemaType.OutputSchemas({
 *   default: { 0: JSON.stringify({ type: "object" }) },
 * }),
 * ```
 */
function OutputSchemas(
  options?: NrgSchemaOptions & { default?: Record<number, string> },
) {
  return BaseType.Record(BaseType.Number(), BaseType.String(), {
    description:
      "Per-port output data-validation schema (JSON Schema string), keyed by output port index.",
    default: {},
    ...options,
  });
}

/**
 * Declares the `inputSchema` config property: the input port's DATA-VALIDATION
 * schema, a JSON-Schema string a flow author edits in the editor. Declaring it
 * exposes the input Schema editor (enabled when Validate Data is on for the
 * input). The effective input schema is the flow-author value, else this default.
 */
function InputSchema(options?: NrgSchemaOptions & { default?: string }) {
  return BaseType.String({
    description: "Input data-validation schema (JSON Schema string).",
    default: "",
    ...options,
  });
}

/**
 * Identical to TypeBox's `Type.Unsafe` at runtime (no validation), but brands
 * the static type as {@link UnsafeBrand} so the per-plane resolvers pass `T`
 * through unchanged. Without the brand a class instance (`Unsafe<Connection>`)
 * is deep-mapped into a structural object and loses its private/`#` members,
 * making it unassignable to `Connection`. The brand is phantom — runtime output
 * is exactly TypeBox's empty/`options` schema.
 */
function NrgUnsafe<T = unknown>(options?: object): TUnsafe<UnsafeBrand<T>> {
  return BaseType.Unsafe(options) as unknown as TUnsafe<UnsafeBrand<T>>;
}

/**
 * Extended TypeBox type builder with NRG-specific schema types.
 * Includes all standard TypeBox types plus {@link NodeRef}, {@link TypedInput},
 * {@link OutputReturnProperties} and {@link OutputContextModes}.
 *
 * For ports or config fields that carry non-data values (functions, class
 * instances, Buffers, streams, connections), use `Unsafe<T>()` to get the
 * TypeScript type without runtime validation — `Any()`/`Unknown()` skip
 * validation too but lose the type. For config-node references and typed inputs
 * use {@link NodeRef} / {@link TypedInput} instead. See the Schemas guide.
 */
// The NRG-specific builders. Some (String, Unsafe) shadow a TypeBox builder of
// the same name: `Object.assign` would otherwise INTERSECT the two function
// types into an overload and the call could resolve to TypeBox's version — which
// for `Unsafe` loses the `UnsafeBrand` brand. The explicit type below omits
// the shadowed keys from TypeBox so the NRG versions are the only ones visible.
const NRG_SCHEMA_TYPES_FACTORIES = {
  String: NrgString,
  Unsafe: NrgUnsafe,
  NodeRef,
  TypedInput,
  OutputReturnProperties,
  OutputContextModes,
  OutputSchemas,
  InputSchema,
};

const SchemaType: Omit<
  typeof BaseType,
  keyof typeof NRG_SCHEMA_TYPES_FACTORIES
> &
  typeof NRG_SCHEMA_TYPES_FACTORIES = Object.assign(
  {},
  BaseType,
  NRG_SCHEMA_TYPES_FACTORIES,
);

/**
 * Recursively tag a schema's non-JSON-typed nodes (Function, Constructor, …) so
 * AJV skips them: it sets `x-nrg-skip-validation`, moves any `default` aside to
 * `_default`, and deletes the offending `type` (AJV throws `type must be
 * JSONType` otherwise). `defineSchema` calls this on the schemas it builds, so
 * every node schema (which goes through `defineSchema`) is normalized. Mutates
 * in place and is idempotent — a schema already normalized has no non-JSON
 * `type` left to strip.
 */
function markNonValidatable<T extends TSchema>(schema: T): T {
  const type = (schema as any).type;

  const hasInvalidType =
    type !== undefined &&
    (Array.isArray(type) ? !type.every(isJSONType) : !isJSONType(type));

  // NOTE: if the type is non serializable, like Functions or Constructor, we must skip validation and avoid applying defaults
  if (hasInvalidType) {
    (schema as any)["x-nrg-skip-validation"] = true;

    if ((schema as any).default !== undefined) {
      (schema as any)._default = (schema as any).default;
      delete (schema as any).default;
    }

    // NOTE: delete type to avoid the following error during validation => Error registering node types: Error: type must be JSONType or JSONType[]: Function
    delete (schema as any).type;
  }

  if (schema.properties) {
    for (const prop of Object.values(schema.properties)) {
      markNonValidatable(prop as TSchema);
    }
  }

  // Record schemas (SchemaType.Record, OutputReturnProperties/ContextModes) put
  // their value schema under patternProperties / additionalProperties, not
  // properties — recurse so a non-JSON Record value is marked too.
  if (schema.patternProperties) {
    for (const prop of Object.values(schema.patternProperties)) {
      markNonValidatable(prop as TSchema);
    }
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    markNonValidatable(schema.additionalProperties as TSchema);
  }

  if (schema.items) {
    markNonValidatable(schema.items as TSchema);
  }

  if (schema.anyOf) {
    schema.anyOf.forEach((s) => markNonValidatable(s as TSchema));
  }

  if (schema.allOf) {
    schema.allOf.forEach((s) => markNonValidatable(s as TSchema));
  }

  if (schema.oneOf) {
    schema.oneOf.forEach((s) => markNonValidatable(s as TSchema));
  }

  return schema;
}

/**
 * Creates a validated object schema from a set of properties, tagged with a
 * required, unique `$id`. Automatically marks non-JSON types (e.g., Function) as
 * non-validatable.
 *
 * The `$id` is **required**: it's the AJV compile-cache key (validators are
 * reused per `$id`, so it must be unique across all your schemas), and it makes
 * the schema addressable for cross-schema `$ref`. Convention: `"<node-type>:<role>"`
 * (e.g. `"my-node:configs"`, `"my-node:credentials"`, `"my-node:input"`).
 *
 * @example
 * ```ts
 * const ConfigsSchema = defineSchema({
 *   name: SchemaType.String({ default: "" }),
 *   timeout: SchemaType.Number({ default: 5000 }),
 * }, { $id: "my-node:configs" });
 * ```
 */
function defineSchema<T extends TProperties>(
  properties: T,
  options: ObjectOptions & { $id: string },
): Schema<T> {
  const schema = SchemaType.Object(properties, options);
  return markNonValidatable(schema) as Schema<T>;
}

export { SchemaType, defineSchema, markNonValidatable };
