// The Node-RED editor API types — the client-plane twin of `server/node-red.ts`
// — which the nrg client abstractions in `./types` build on. These describe the
// raw shapes Node-RED's editor exposes (node instances, `_def` definitions,
// defaults/credentials records, TypedInput fields), untouched by nrg semantics.

import type { App } from "vue";

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
   * Per-port output data-validation settings, indexed by base-output port — a
   * framework config field merged into every IONode's config schema; read at
   * runtime by IONode.
   */
  validateOutputs?: Record<number, boolean>;

  [key: string]: any;
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

/** Client-side representation of a TypedInput field: the raw value string and its type selector. */
interface TypedInput {
  value: string;
  type: string;
}

export type {
  NodeRedNode,
  NodeRedNodeButtonDefinition,
  NodeDefaults,
  NodeCredentials,
  TypedInput,
};
