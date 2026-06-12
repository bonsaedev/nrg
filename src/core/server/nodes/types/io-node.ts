import type { Static, TSchema } from "@sinclair/typebox";
import type { IONodeConfigSchema } from "../../schemas";
import type { RED } from "../../../server/types";
import type { IONode } from "../io-node";
import type {
  INode,
  NodeConfig,
  NodeCredentials,
  NodeContextStore,
  NodeContextScope,
} from "./node";
import type { InferOr, InferOutputs } from "../../schemas/types";

type IONodeContextScope = NodeContextScope;

type IONodeConfig<TConfig = any> = NodeConfig<TConfig> &
  Static<typeof IONodeConfigSchema> & {
    validateInput?: boolean;
    /** Per-port output-validation flags, keyed by base-output port index. */
    validateOutputs?: Record<number, boolean>;
    /** Per-port return properties, keyed by base-output port index. */
    outputReturnProperties?: Record<number, string>;
    /** Per-port context modes, keyed by base-output port index. */
    contextModes?: Record<number, "carry" | "trace" | "reset">;
  };

type IONodeCredentials<TCredentials = any> = NodeCredentials<TCredentials>;

type IONodeStatus =
  | { fill?: "red" | "green"; shape?: "dot" | "string"; text?: string }
  | string;

type IONodeContext = {
  (scope: IONodeContextScope, store?: string): NodeContextStore;
  node: NodeContextStore;
  flow: NodeContextStore;
  global: NodeContextStore;
};

type HexColor = `#${string}`;

type BoundIONode<
  TC extends TSchema | undefined,
  TCr extends TSchema | undefined,
  TS extends TSchema | undefined,
  TIn extends TSchema | undefined,
  TOut extends
    | TSchema
    | readonly TSchema[]
    | Record<string, TSchema>
    | undefined,
> = IONode<
  InferOr<TC, any>,
  InferOr<TCr, any>,
  InferOr<TIn, any>,
  InferOutputs<TOut>,
  InferOr<TS, any>
>;

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

  input(msg: TInput): void | Promise<void>;
  send(msg: TOutput): void;
  status(status: IONodeStatus): void;
  updateWires(wires: string[][]): void;
  receive(msg: TInput): void;

  readonly baseOutputs: number;
  readonly totalOutputs: number;
  sendToPort<
    P extends
      | (TOutput extends Record<string, Record<string, any>>
          ? keyof TOutput & string
          : never)
      | number,
  >(
    port: P,
    msg: P extends keyof TOutput ? TOutput[P] : unknown,
  ): void;
}

interface IONodeDefinition<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
  TInputSchema extends TSchema | undefined = undefined,
  TOutputsSchema extends
    | TSchema
    | readonly TSchema[]
    | Record<string, TSchema>
    | undefined = undefined,
> {
  type: string;
  category?: string;
  color?: HexColor;
  align?: "left" | "right";

  configSchema?: TConfigSchema;
  credentialsSchema?: TCredsSchema;
  settingsSchema?: TSettingsSchema;
  inputSchema?: TInputSchema;
  outputsSchema?: TOutputsSchema;

  validateInput?: boolean;
  validateOutput?: boolean;

  registered?(RED: RED): void | Promise<void>;
  created?(
    this: BoundIONode<
      TConfigSchema,
      TCredsSchema,
      TSettingsSchema,
      TInputSchema,
      TOutputsSchema
    >,
  ): void | Promise<void>;
  closed?(
    this: BoundIONode<
      TConfigSchema,
      TCredsSchema,
      TSettingsSchema,
      TInputSchema,
      TOutputsSchema
    >,
    removed?: boolean,
  ): void | Promise<void>;
  input?(
    this: BoundIONode<
      TConfigSchema,
      TCredsSchema,
      TSettingsSchema,
      TInputSchema,
      TOutputsSchema
    >,
    msg: InferOr<TInputSchema, any>,
  ): void | Promise<void>;
}

export {
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
