import type { Static, TSchema } from "@sinclair/typebox";
import type { IONodeConfigSchema } from "../../schemas";
import type { RED } from "../../../server/types";
import type { IONode } from "../io-node";
import type {
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
    validateOutput?: boolean;
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
  TOut extends TSchema | readonly TSchema[] | undefined,
> = IONode<
  InferOr<TC, any>,
  InferOr<TCr, any>,
  InferOr<TIn, any>,
  InferOutputs<TOut>,
  InferOr<TS, any>
>;

interface IONodeInstance<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
> {
  readonly config: IONodeConfig<TConfig>;
  readonly credentials: IONodeCredentials<TCredentials> | undefined;
  readonly id: string;
  readonly name: string | undefined;
  created?(): void | Promise<void>;
  closed?(removed?: boolean): void | Promise<void>;
  input(msg: TInput): void | Promise<void>;
  send(msg: TOutput): void;
  /** @internal */
  readonly _baseOutputs: number;
  /** @internal */
  readonly _totalOutputs: number;
  /** @internal */
  _getErrorPortIndex(): number | null;
  /** @internal */
  _getCompletePortIndex(): number | null;
  /** @internal */
  _getStatusPortIndex(): number | null;
}

interface IONodeDefinition<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
  TInputSchema extends TSchema | undefined = undefined,
  TOutputsSchema extends TSchema | readonly TSchema[] | undefined = undefined,
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
  IONodeConfig,
  IONodeContext,
  IONodeContextScope,
  IONodeCredentials,
  IONodeDefinition,
  IONodeInstance,
  IONodeStatus,
};
