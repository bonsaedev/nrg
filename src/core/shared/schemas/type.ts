import type {
  TSchema,
  TProperties,
  TString,
  TUnsafe,
  ObjectOptions,
  StringOptions,
  StringFormatOption,
} from "@sinclair/typebox";
import type { Schema, NrgSchemaOptions } from "./types";
import type { UnsafeResolved, ConfigNodeBrand } from "../types";
import { Type as BaseType, Kind } from "@sinclair/typebox";
import { TypedInputSchema } from "./base";
import type { TNodeRef, TTypedInput } from "./types";

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

/** A constructor type — used to detect when the NodeRef generic is a class. */
type AnyConstructor = abstract new (...args: any[]) => any;

/** Resolves the NodeRef generic: a class → its instance, anything else → itself. */
type NodeRefInstance<T> = T extends AnyConstructor ? InstanceType<T> : T;

/**
 * What the `NodeRef<T>` generic accepts: a config node instance type, or its
 * constructor. Both carry {@link ConfigNodeBrand} (declared by `ConfigNode` /
 * `IConfigNode`), so `NodeRef<string>` or `NodeRef<{ host: string }>` is a
 * compile error while any real config class passes. Constrained via the shared
 * brand so this browser-safe module never imports the server `ConfigNode` type.
 */
type ConfigNodeRef =
  | ConfigNodeBrand
  | (abstract new (...args: any[]) => ConfigNodeBrand);

/**
 * Creates a schema for a reference to a config node by its registered `type`.
 *
 * Pass the node `type` string at runtime and the config class as a *type-only*
 * generic: `SchemaType.NodeRef<BrokerConfig>("broker-config")`. The generic is
 * erased at compile time, so this never value-imports the config class and the
 * call stays safe to evaluate in the browser/editor bundle (where server node
 * classes don't exist). The runtime payload is identical on both planes.
 *
 * Type resolution is per-plane and unchanged: on the server `this.config.<ref>`
 * still resolves to the referenced node *instance* (`BrokerConfig`, with all its
 * props/methods); on the client the same field resolves to the node id `string`.
 * The generic accepts either the class (`NodeRef<BrokerConfig>`) or an instance
 * type (`NodeRef<BrokerConfigInstance>`); omit it for an untyped (`unknown`) ref.
 */
function NodeRef<T extends ConfigNodeRef = ConfigNodeBrand>(
  type: string,
  options?: NrgSchemaOptions,
): TNodeRef<NodeRefInstance<T>> {
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
  } as unknown as TNodeRef<NodeRefInstance<T>>;
}

/** Creates a schema for a Node-RED TypedInput (value + type pair). */
function TypedInput<T = unknown>(options?: NrgSchemaOptions): TTypedInput<T> {
  return {
    ...TypedInputSchema,
    // `...options` first; the framework key below wins (see NodeRef).
    ...options,
    "x-nrg-typed-input": true,
    [Kind]: "TypedInput",
  } as unknown as TTypedInput<T>;
}

/**
 * String `format` values NRG validates at runtime. TypeBox's own
 * `StringFormatOption` covers the standard JSON Schema formats (`email`,
 * `date-time`, `uri`, `uuid`, `ipv4`, …); this adds the ajv-formats (full mode)
 * that TypeBox omits but `addFormats()` in `core/validator.ts` registers —
 * notably `password`, which drives the editor's password input — plus NRG's own
 * `node-id` (registered in the core validation modules). The trailing `({} & string)`
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
 * Identical to TypeBox's `Type.Unsafe` at runtime (no validation), but brands
 * the static type as {@link UnsafeResolved} so the per-plane resolvers pass `T`
 * through unchanged. Without the brand a class instance (`Unsafe<Connection>`)
 * is deep-mapped into a structural object and loses its private/`#` members,
 * making it unassignable to `Connection`. The brand is phantom — runtime output
 * is exactly TypeBox's empty/`options` schema.
 */
function NrgUnsafe<T = unknown>(options?: object): TUnsafe<UnsafeResolved<T>> {
  return BaseType.Unsafe(options) as unknown as TUnsafe<UnsafeResolved<T>>;
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
// for `Unsafe` loses the `UnsafeResolved` brand. The explicit type below omits
// the shadowed keys from TypeBox so the NRG versions are the only ones visible.
const NrgBuilders = {
  String: NrgString,
  Unsafe: NrgUnsafe,
  NodeRef,
  TypedInput,
  OutputReturnProperties,
  OutputContextModes,
};

const SchemaType: Omit<typeof BaseType, keyof typeof NrgBuilders> &
  typeof NrgBuilders = Object.assign({}, BaseType, NrgBuilders);

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
 * Creates a validated object schema from a set of properties. Automatically
 * marks non-JSON types (e.g., Function) as non-validatable.
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
  options?: ObjectOptions & { $id?: string },
): Schema<T> {
  const schema = SchemaType.Object(properties, options);
  return markNonValidatable(schema) as Schema<T>;
}

export { SchemaType, defineSchema };
