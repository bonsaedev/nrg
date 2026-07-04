// Self-registering editor wire-checker (dev-only; fails open without a dev
// server). Side-effect only — deliberately NOT re-exported through public.ts.
import "./wire-check";

export { defineNode, registerType, registerTypes } from "./registration";

export { useFormNode } from "./form/composables/use-form-node";

export type {
  NodeRedNode,
  NodeRedNodeButtonDefinition,
  NodeDefinition,
  NodeButtonDefinition,
  NodeFormDefinition,
  TypedInput,
  Infer,
} from "./types";
