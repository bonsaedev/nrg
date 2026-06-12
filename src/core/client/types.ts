import type { Component, App } from "vue";
import type { TSchema, Static } from "@sinclair/typebox";
import type { SchemaObject } from "ajv";
import type { NodeRefResolved, TypedInputResolved } from "../brands";
import type { JsonSchemaObjectExtensions } from "../schema-options";

export interface NodeStateCredentials {
  [key: string]: any;
}

export interface NodeState {
  credentials: NodeStateCredentials;
  [key: string]: any;
}

export interface NodeButtonDefinition {
  toggle: string;
  onClick: () => void;
  enabled?: () => boolean;
  visible?: () => boolean;
}

export interface NodeRedNodeButtonDefinition {
  toggle: string;
  onclick: () => void;
  enabled?: () => boolean;
  visible?: () => boolean;
}

export interface NodeFormDefinition {
  component?: Component;
}

export interface NodeRedNode {
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
   * Per-port output settings, indexed by base-output port; injected (empty) when
   * the node has an outputsSchema. Read at runtime by IONode.
   * `outputReturnProperties` is author-declared (SchemaType.OutputReturnProperties)
   * — present only when the node opts into per-port return keys.
   */
  validateOutputs?: Record<number, boolean>;
  contextModes?: Record<number, "carry" | "trace" | "reset">;
  outputReturnProperties?: Record<number, string>;

  [key: string]: any;
}

export interface NodeDefinition {
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

/** Form rendering hints carried by the `x-nrg-form` schema keyword. */
export type NrgFormOptions = NonNullable<
  JsonSchemaObjectExtensions["x-nrg-form"]
>;

/**
 * A serialized property schema inside {@link JsonSchemaObject} `properties`,
 * including NRG's custom keywords (shared vocabulary in core/schema-options)
 * that drive form rendering and NodeRef/TypedInput identification.
 */
export interface JsonPropertySchema extends JsonSchemaObjectExtensions {
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
}

/**
 * A serialized JSON Schema object as the build pipeline emits it (never a
 * live TypeBox instance). Extends ajv's `SchemaObject` so it flows into
 * validator APIs without casts, while keeping the `type: "object"`
 * discriminant and structured `properties`/`required` that ajv's open
 * `[x: string]: any` shape does not provide.
 */
export interface JsonSchemaObject extends SchemaObject {
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
export interface RuntimeNodeDefinition extends NodeDefinition {
  defaults?: NodeDefaults;
  credentials?: NodeCredentials;
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

export interface NodeDefaults {
  [key: string]: {
    value: any;
    type?: string;
    label?: string;
    required?: boolean;
    validate?: (this: NodeRedNode, value: any, opt: any) => any;
  };
}

export interface NodeCredentials {
  [key: string]: {
    value?: string;
    type?: "password" | "text";
    label?: string;
    required?: boolean;
  };
}

export interface NodeFeatures {
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
export interface TypedInputValue {
  value: string;
  type: string;
}

/**
 * Maps a schema's static type to the raw values the editor form holds.
 * The server counterpart (`ResolvedStatic` in server/schemas/types) maps the
 * same brands — shared via core/brands — to resolved runtime values instead.
 * - `NodeRef<T>` → `string` (the referenced node's id)
 * - `TypedInput<T>` → `TypedInputValue` (raw value + type pair)
 * - Functions pass through, arrays and objects map recursively
 */
export type EditorStatic<T> =
  T extends NodeRefResolved<any>
    ? string
    : T extends TypedInputResolved
      ? TypedInputValue
      : T extends (...args: any[]) => any
        ? T
        : T extends Array<infer I>
          ? EditorStatic<I>[]
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
 * @example
 * ```ts
 * import type { Infer } from "@bonsae/nrg/client";
 * import type { ConfigSchema } from "../schemas/my-node";
 *
 * type Config = Infer<typeof ConfigSchema>;
 * ```
 */
export type Infer<T extends TSchema> = EditorStatic<Static<T>>;
