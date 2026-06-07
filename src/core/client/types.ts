import type { Component, App } from "vue";
import type { TSchema, Static } from "@sinclair/typebox";
import type { NodeRefResolved } from "../server/schemas/types";

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

export interface MergedNodeDefinition extends NodeDefinition {
  defaults?: NodeDefaults;
  credentials?: NodeCredentials;
  configSchema?: Record<string, any>;
  credentialsSchema?: { properties?: Record<string, any> };
  outputsSchema?: Record<string, any>;
  inputSchema?: Record<string, any>;
}

export interface NodeFeatures {
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
}

// -- Client-side type inference --

/** Client-side representation of a TypedInput field: the raw value string and its type selector. */
export interface TypedInputValue {
  value: string;
  type: string;
}

type _ToClient<T> =
  T extends NodeRefResolved<any>
    ? string
    : T extends { resolve(...args: any[]): any; value: unknown; type: string }
      ? TypedInputValue
      : T extends (...args: any[]) => any
        ? T
        : T extends Array<infer I>
          ? _ToClient<I>[]
          : T extends object
            ? { [K in keyof T]: _ToClient<T[K]> }
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
export type Infer<T extends TSchema> = _ToClient<Static<T>>;
