import type { Static, TSchema } from "@sinclair/typebox";
import type { RED } from "../../../server/types";
import type { ConfigNode } from "../config-node";
import type {
  NodeConfig,
  NodeCredentials,
  NodeContextScope,
  NodeContextStore,
} from "./node";
import type { InferOr } from "../../schemas/types";
import type { ConfigNodeConfigSchema } from "../../schemas";

type ConfigNodeContextScope = Exclude<NodeContextScope, "flow">;

type ConfigNodeConfig<TConfig = any> = NodeConfig<TConfig> &
  Static<typeof ConfigNodeConfigSchema>;

type ConfigNodeCredentials<TCredentials = any> = NodeCredentials<TCredentials>;

type ConfigNodeContext = {
  (scope: ConfigNodeContextScope, store?: string): NodeContextStore;
  node: NodeContextStore;
  global: NodeContextStore;
};

type BoundConfigNode<
  TC extends TSchema | undefined,
  TCr extends TSchema | undefined,
  TS extends TSchema | undefined,
> = ConfigNode<InferOr<TC, any>, InferOr<TCr, any>, InferOr<TS, any>>;

interface ConfigNodeInstance<TConfig = any, TCredentials = any> {
  readonly config: ConfigNodeConfig<TConfig>;
  readonly credentials: ConfigNodeCredentials<TCredentials> | undefined;
  readonly id: string;
  readonly name: string | undefined;
  created?(): void | Promise<void>;
  closed?(removed?: boolean): void | Promise<void>;
}

interface ConfigNodeDefinition<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
> {
  type: string;

  configSchema?: TConfigSchema;
  credentialsSchema?: TCredsSchema;
  settingsSchema?: TSettingsSchema;

  registered?(RED: RED): void | Promise<void>;
  created?(
    this: BoundConfigNode<TConfigSchema, TCredsSchema, TSettingsSchema>,
  ): void | Promise<void>;
  closed?(
    this: BoundConfigNode<TConfigSchema, TCredsSchema, TSettingsSchema>,
    removed?: boolean,
  ): void | Promise<void>;
}

export {
  BoundConfigNode,
  ConfigNodeConfig,
  ConfigNodeContext,
  ConfigNodeCredentials,
  ConfigNodeContextScope,
  ConfigNodeDefinition,
  ConfigNodeInstance,
};
