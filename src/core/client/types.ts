import type { Component, App } from "vue";

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

export interface NodeFeatures {
  hasInputSchema: boolean;
  hasOutputSchema: boolean;
}
