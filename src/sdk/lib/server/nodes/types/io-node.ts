import type { Schema } from "../../../shared/schemas";
import type { BUILTIN_PORT_KEYS } from "../../../shared/constants";
import type { RED } from "../../red";
import type { IONode } from "../io-node";
import type {
  INode,
  NodeConfig,
  NodeCredentials,
  NodeContextStore,
  NodeContextScope,
} from "./node";
import type { OutputPortNames, PortValue } from "./ports";

type IONodeContextScope = NodeContextScope;

/** Editor-managed built-in port toggles (error/complete/status), saved in config. */
type BuiltinPortFlags = {
  [K in (typeof BUILTIN_PORT_KEYS)[number]]?: boolean;
};

type IONodeConfig<TConfig = any> = NodeConfig<TConfig> & {
  wires: string[][];
  x: number;
  y: number;
  g?: string;
} & BuiltinPortFlags & {
    validateInput?: boolean;
    /** Per-port output-validation flags, keyed by base-output port index. */
    validateOutputs?: Record<number, boolean>;
    /** Design-time: type-check wires INTO this node's input (editor wire check). */
    validateInputTypes?: boolean;
    /**
     * Design-time: type-check wires OUT of a base output port, keyed by
     * base-output port index (editor wire check).
     */
    validateOutputTypes?: Record<number, boolean>;
    /** Per-port return properties, keyed by base-output port index. */
    outputReturnProperties?: Record<number, string>;
    /** Per-port context modes, keyed by base-output port index. */
    outputContextModes?: Record<number, "carry" | "trace" | "reset">;
    /** Flow-author input data-validation schema override (JSON Schema string);
     * overwrites the node's static `inputSchema` at validation time. */
    inputSchema?: string;
    /** Flow-author per-port output data-validation schema overrides (JSON Schema
     * strings), keyed by base-output port index; overwrite the static schema. */
    outputSchemas?: Record<number, string>;
  };

type IONodeCredentials<TCredentials = any> = NodeCredentials<TCredentials>;

type IONodeStatus =
  | {
      fill?: "red" | "green" | "yellow" | "blue" | "grey" | "gray";
      shape?: "ring" | "dot";
      text?: string;
    }
  | string;

type IONodeContext = {
  (scope: IONodeContextScope, store?: string): NodeContextStore;
  node: NodeContextStore;
  flow: NodeContextStore;
  global: NodeContextStore;
};

/**
 * Node palette color. The template-literal type only enforces a leading `#`
 * (an exact 6-hex-digit template type is infeasible — it explodes to `TS2590`),
 * so shorthand (`#abc`) and invalid hex type-check but are rejected at runtime.
 * The real gate is the `/^#[0-9A-Fa-f]{6}$/` check in `Node.register`.
 */
type HexColor = `#${string}`;

type BoundIONode<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
> = IONode<TConfig, TCredentials, TInput, TOutput, TSettings>;

/** Public instance interface for IO nodes. Implemented by {@link IONode}. */
interface IIONode<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
> extends INode<TConfig, TCredentials, TSettings> {
  readonly config: IONodeConfig<TConfig>;
  readonly credentials: IONodeCredentials<TCredentials> | undefined;
  readonly x: number;
  readonly y: number;
  readonly g: string | undefined;
  readonly wires: string[][];

  // A returned value (when not `undefined`) rides the complete port under
  // `output`; `void`/no return keeps the plain completion signal.
  input(msg: TInput): unknown;
  send(msg: TOutput): void;
  status(status: IONodeStatus): void;
  updateWires(wires: string[][]): void;
  receive(msg: TInput): void;

  readonly baseOutputs: number;
  readonly totalOutputs: number;
  sendToPort<P extends OutputPortNames<TOutput> | number>(
    port: P,
    msg: P extends keyof TOutput ? PortValue<TOutput[P]> : unknown,
  ): void;
}

interface IONodeDefinition<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
> {
  type: string;
  category?: string;
  color?: HexColor;
  align?: "left" | "right";

  // Runtime schemas: config drives the editor form + config validation;
  // credentials/settings likewise. Port topology and `msg`/`send` typing come
  // from the TInput/TOutput generics, NOT from these — input/output data
  // validation is declared in the config schema (`inputSchema`/`outputSchemas`).
  configSchema?: Schema;
  credentialsSchema?: Schema;
  settingsSchema?: Schema;

  registered?(RED: RED): void | Promise<void>;
  created?(
    this: BoundIONode<TConfig, TCredentials, TInput, TOutput, TSettings>,
  ): void | Promise<void>;
  closed?(
    this: BoundIONode<TConfig, TCredentials, TInput, TOutput, TSettings>,
    removed?: boolean,
  ): void | Promise<void>;
  // A returned value (when not `undefined`) rides the complete port under
  // `output`; `void`/no return keeps the plain completion signal.
  input?(
    this: BoundIONode<TConfig, TCredentials, TInput, TOutput, TSettings>,
    msg: TInput,
  ): unknown;
}

export type {
  BoundIONode,
  HexColor,
  IIONode,
  IONodeConfig,
  IONodeContext,
  IONodeContextScope,
  IONodeCredentials,
  IONodeDefinition,
  IONodeStatus,
};
