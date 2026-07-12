import type { BUILTIN_PORT_KEYS } from "../../../shared/constants";
import type { IONode } from "../io-node";
import type {
  INode,
  NodeConfig,
  NodeCredentials,
  NodeContextStore,
  NodeContextScope,
} from "./node";
import type {
  OutputPortNames,
  PortValue,
  Port,
  OutputSpec,
  InputSpec,
  OmitMessageLanes,
} from "./ports";

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
  TInput extends InputSpec = any,
  TOutput extends OutputSpec = any,
  TSettings = any,
> extends INode<TConfig, TCredentials, TSettings> {
  readonly config: IONodeConfig<TConfig>;
  readonly credentials: IONodeCredentials<TCredentials> | undefined;
  readonly x: number;
  readonly y: number;
  readonly g: string | undefined;
  readonly wires: string[][];

  // A returned value (when not `undefined`) rides the complete port under
  // `output`; `void`/no return keeps the plain completion signal. `TInput` is the
  // wrapped message type (`Input<…>`), so the parameter already carries the
  // off-the-wire lanes alongside the wire fields.
  input(msg: TInput): unknown;
  status(status: IONodeStatus): void;
  updateWires(wires: string[][]): void;
  // `receive` drives the handler with a raw WIRE message — the lanes are installed
  // by the framework, so callers pass {@link OmitMessageLanes}`<TInput>`, not the
  // wrapped type.
  receive(msg: OmitMessageLanes<TInput>): void;

  readonly baseOutputs: number;
  readonly totalOutputs: number;
  // Emit a value on one output port, addressed by NAME (a named `Port` record) or
  // by numeric index (a dynamic `Port<T>[]`). `protectedData`/`privateData` populate
  // the message's off-the-wire lanes for this signal; they never ride the serialized
  // msg. Built-in error/complete/status ports are framework-managed — not `send`-able.
  send<P extends OutputPortNames<TOutput> | number>(
    port: P,
    msg: P extends keyof TOutput
      ? PortValue<TOutput[P]>
      : P extends number
        ? PortValue<TOutput[keyof TOutput]>
        : unknown,
    protectedData?: object,
    privateData?: object,
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
