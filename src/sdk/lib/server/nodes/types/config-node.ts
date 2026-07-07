import type { Schema } from "../../../shared/schemas";
import type { RED } from "../../red";
import type { ConfigNode } from "../config-node";
import type {
  INode,
  NodeConfig,
  NodeCredentials,
  NodeContextScope,
  NodeContextStore,
} from "./node";
import type { ConfigNodeBrand } from "../../../shared/schemas/types";

type ConfigNodeContextScope = Exclude<NodeContextScope, "flow">;

type ConfigNodeConfig<TConfig = any> = NodeConfig<TConfig> & {
  _users: string[];
};

type ConfigNodeCredentials<TCredentials = any> = NodeCredentials<TCredentials>;

type ConfigNodeContext = {
  (scope: ConfigNodeContextScope, store?: string): NodeContextStore;
  node: NodeContextStore;
  global: NodeContextStore;
};

type BoundConfigNode<
  TConfig = any,
  TCredentials = any,
  TSettings = any,
> = ConfigNode<TConfig, TCredentials, TSettings>;

/** Public instance interface for config nodes. Implemented by {@link ConfigNode}. */
interface IConfigNode<TConfig = any, TCredentials = any, TSettings = any>
  extends INode<TConfig, TCredentials, TSettings>, ConfigNodeBrand {
  readonly config: ConfigNodeConfig<TConfig>;
  readonly credentials: ConfigNodeCredentials<TCredentials> | undefined;
  readonly userIds: string[];
  readonly users: INode[];
  getUser<T extends INode = INode>(index: number): T | undefined;
}

interface ConfigNodeDefinition<
  TConfig = any,
  TCredentials = any,
  TSettings = any,
> {
  type: string;

  configSchema?: Schema;
  credentialsSchema?: Schema;
  settingsSchema?: Schema;

  registered?(RED: RED): void | Promise<void>;
  created?(
    this: BoundConfigNode<TConfig, TCredentials, TSettings>,
  ): void | Promise<void>;
  closed?(
    this: BoundConfigNode<TConfig, TCredentials, TSettings>,
    removed?: boolean,
  ): void | Promise<void>;
}

export type {
  BoundConfigNode,
  ConfigNodeConfig,
  ConfigNodeContext,
  ConfigNodeCredentials,
  ConfigNodeContextScope,
  ConfigNodeDefinition,
  IConfigNode,
};
