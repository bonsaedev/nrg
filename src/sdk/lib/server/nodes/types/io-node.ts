import type { BUILTIN_PORT_KEYS } from "../../../shared/constants";
import type { IONode } from "../io-node";
import type {
  INode,
  NodeConfig,
  NodeCredentials,
  NodeContextStore,
  NodeContextScope,
} from "./node";
import type { OutputPortNames, PortValue, MessageLanes } from "./ports";

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
    /** Flow-author input data-validation schema (JSON Schema string), applied
     * when `validateInput` is on. */
    inputSchema?: string;
    /** Flow-author per-port output data-validation schemas (JSON Schema
     * strings), keyed by base-output port index. */
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
  // `output`; `void`/no return keeps the plain completion signal. The message
  // also carries the off-the-wire {@link MessageLanes} accessors.
  input(msg: TInput & MessageLanes): unknown;
  // `protectedData`/`privateData` populate the message's off-the-wire lanes for
  // this signal (see {@link MessageLanes}); they never ride the serialized msg.
  send(msg: TOutput, protectedData?: object, privateData?: object): void;
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

export type {
  IIONode,
  IONodeConfig,
  IONodeContext,
  IONodeContextScope,
  IONodeCredentials,
  IONodeStatus,
};
