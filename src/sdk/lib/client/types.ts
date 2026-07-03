import type { Component, App } from "vue";
import type { TSchema, Static } from "@sinclair/typebox";
import type { SchemaObject } from "ajv";
import type {
  NodeRefBrand,
  TypedInputBrand,
  UnsafeBrand,
} from "../shared/schemas/types";
import type { JsonSchemaObjectExtensions } from "../shared/schema-options";

interface NodeStateCredentials {
  [key: string]: any;
}

interface NodeState {
  credentials: NodeStateCredentials;
  [key: string]: any;
}

interface NodeButtonDefinition {
  toggle: string;
  onClick: () => void;
  enabled?: () => boolean;
  visible?: () => boolean;
}

interface NodeFormDefinition {
  component?: Component;
}

interface NodeRedNodeButtonDefinition {
  toggle: string;
  onclick: () => void;
  enabled?: () => boolean;
  visible?: () => boolean;
}

interface NodeRedNode {
  id: string;
  type: string;
  name: string;
  category: string;
  x: string;
  y: string;
  g: string;
  z: string;
  credentials: Record<string, any>;
  _def: {
    defaults: Record<
      string,
      { value: string; type?: string; label?: string; required?: boolean }
    >;
    credentials: Record<
      string,
      {
        value: string;
        type?: "password" | "text";
        label?: string;
        required?: boolean;
      }
    >;
    category: string;
    color?: string;
    icon?: string;
    label?: ((this: NodeRedNode) => string) | string;
    inputs?: number;
    outputs?: number;
    paletteLabel?: ((this: NodeRedNode) => string) | string;
    labelStyle?: ((this: NodeRedNode) => string) | string;
    inputLabels?: ((this: NodeRedNode, index: number) => string) | string;
    outputLabels?: ((this: NodeRedNode, index: number) => string) | string;
    align?: "left" | "right";
    button?: NodeRedNodeButtonDefinition;
  };
  _newState?: NodeRedNode;
  _app?: App | null;
  _: (str: string) => string;

  // -- framework-managed config props --
  /** dynamic port count (base outputs + enabled built-in ports) */
  outputs?: number;
  /** injected when the node has an inputSchema */
  validateInput?: boolean;
  /** built-in port toggles, present when declared in the configSchema */
  errorPort?: boolean;
  completePort?: boolean;
  statusPort?: boolean;
  /**
   * Per-port output settings, indexed by base-output port. `validateOutputs` is
   * injected (empty) when the node has an outputsSchema; `outputReturnProperties`
   * and `outputContextModes` are author-declared (SchemaType.*) — present only
   * when the node opts into per-port return keys / context modes. Read at
   * runtime by IONode.
   */
  validateOutputs?: Record<number, boolean>;
  outputContextModes?: Record<number, "carry" | "trace" | "reset">;
  outputReturnProperties?: Record<number, string>;

  [key: string]: any;
}

interface NodeDefinition {
  type: string;
  category?: string;
  color?: string;
  icon?: ((this: NodeRedNode) => string) | string;
  label?: ((this: NodeRedNode) => string) | string;
  inputs?: number;
  outputs?: number;
  paletteLabel?: ((this: NodeRedNode) => string) | string;
  labelStyle?: ((this: NodeRedNode) => string) | string;
  inputLabels?: ((this: NodeRedNode, index: number) => string) | string;
  outputLabels?: ((this: NodeRedNode, index: number) => string) | string;
  align?: "left" | "right";
  button?: NodeButtonDefinition;
  onEditResize?: (
    this: NodeRedNode,
    size: { width: number; height: number },
  ) => void;
  onPaletteAdd?: (this: NodeRedNode) => void;
  onPaletteRemove?: (this: NodeRedNode) => void;
  form?: NodeFormDefinition;
}

/**
 * A serialized property schema inside {@link JsonSchemaObject} `properties`,
 * including NRG's custom keywords (shared vocabulary in core/schema-options)
 * that drive form rendering and NodeRef/TypedInput identification.
 */
interface JsonPropertySchema extends JsonSchemaObjectExtensions {
  type?: string | string[];
  properties?: Record<string, JsonPropertySchema>;
  required?: string[];
  enum?: unknown[];
  anyOf?: JsonPropertySchema[];
  const?: unknown;
  items?: JsonPropertySchema;
  title?: string;
  description?: string;
  default?: unknown;
  minLength?: number;
  minItems?: number;
}

/**
 * A serialized JSON Schema object as the build pipeline emits it (never a
 * live TypeBox instance). Extends ajv's `SchemaObject` so it flows into
 * validator APIs without casts, while keeping the `type: "object"`
 * discriminant and structured `properties`/`required` that ajv's open
 * `[x: string]: any` shape does not provide.
 */
interface JsonSchemaObject extends SchemaObject {
  type: "object";
  properties?: Record<string, JsonPropertySchema>;
  required?: string[];
}

/**
 * A node definition as it exists at editor runtime, after the build pipeline
 * merged in the schema-derived artifacts (defaults, credentials, serialized
 * schemas). Authors write {@link NodeDefinition}; the inliner provides the
 * rest.
 */
interface RuntimeNodeDefinition extends NodeDefinition {
  defaults?: NodeDefaults;
  credentials?: NodeCredentials;
  /**
   * Names of the base output ports when `outputsSchema` is a record of named
   * ports, in declaration order; absent for single/positional outputs. Resolved
   * server-side by the inliner so the editor never guesses port names from the
   * serialized schema.
   */
  outputPortNames?: string[];
  configSchema?: JsonSchemaObject;
  credentialsSchema?: JsonSchemaObject;
  inputSchema?: JsonSchemaObject;
  /**
   * Single port, positional ports, or named ports (key = port name).
   * Not constrained to object schemas: with returnProperty the raw sent
   * value is validated, so results may be any schema shape.
   */
  outputsSchema?:
    | JsonPropertySchema
    | JsonPropertySchema[]
    | Record<string, JsonPropertySchema>;
}

interface NodeDefaults {
  [key: string]: {
    value: any;
    type?: string;
    label?: string;
    required?: boolean;
    validate?: (this: NodeRedNode, value: any, opt: any) => any;
  };
}

interface NodeCredentials {
  [key: string]: {
    value?: string;
    type?: "password" | "text";
    label?: string;
    required?: boolean;
  };
}

interface NodeFeatures {
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
  /**
   * Base output ports (excludes built-in error/complete/status), in port-index
   * order. Drives the per-port context-mode rows in the Outputs subsection.
   */
  outputPorts: { index: number; label: string }[];
}

// -- Client-side type inference --

/** Client-side representation of a TypedInput field: the raw value string and its type selector. */
interface TypedInput {
  value: string;
  type: string;
}

/**
 * Maps a schema's static type to the raw values the editor form holds.
 * The server counterpart (`ResolvedStatic` in server/schemas/types) maps the
 * same brands — shared via shared/schemas/types — to resolved runtime values instead.
 * - `NodeRef<T>` → `string` (the referenced node's id)
 * - `TypedInput<T>` → `TypedInput` (raw value + type pair)
 * - Functions pass through, arrays and objects map recursively
 *
 * The arm before the generic `object` mapping is a loud-failure net, mirroring
 * `ResolvedStatic`: every cross-plane brand shares `readonly __payload`, so a
 * brand that matched none of the explicit arms above is one this resolver
 * doesn't handle yet — map it to `never` (a compile error at every use site)
 * rather than let `object` silently deep-map the brand's internal shape.
 */
type EditorStatic<T> =
  T extends NodeRefBrand<any>
    ? string
    : T extends TypedInputBrand<any>
      ? TypedInput
      : T extends UnsafeBrand<infer V>
        ? V
        : T extends (...args: any[]) => any
          ? T
          : T extends Array<infer I>
            ? EditorStatic<I>[]
            : T extends { readonly __payload: any }
              ? never
              : T extends object
                ? { [K in keyof T]: EditorStatic<T[K]> }
                : T;

/**
 * Infers the client-side TypeScript type from a TypeBox schema.
 *
 * Resolves schema types to their client form representations:
 * - `NodeRef<T>` → `string` (node ID in the editor)
 * - `TypedInput<T>` → `{ value: string; type: string }`
 * - All other types resolve via TypeBox's `Static<T>`
 *
 * Accepts a single schema or a record of schemas (e.g. an outputs map),
 * mirroring the server `Infer` so the same pattern compiles on both planes.
 *
 * @example
 * ```ts
 * import type { Infer } from "@bonsae/nrg/client";
 * import type { ConfigSchema } from "../schemas/my-node";
 *
 * type Config = Infer<typeof ConfigSchema>;
 * ```
 */
type Infer<T extends TSchema | Record<string, TSchema>> = T extends TSchema
  ? EditorStatic<Static<T>>
  : {
      [K in keyof T & string]: T[K] extends TSchema
        ? EditorStatic<Static<T[K]>>
        : never;
    };

export type {
  NodeRedNode,
  NodeRedNodeButtonDefinition,
  NodeState,
  NodeButtonDefinition,
  NodeFormDefinition,
  NodeDefinition,
  JsonPropertySchema,
  JsonSchemaObject,
  RuntimeNodeDefinition,
  NodeDefaults,
  NodeCredentials,
  NodeFeatures,
  TypedInput,
  EditorStatic,
  Infer,
};
