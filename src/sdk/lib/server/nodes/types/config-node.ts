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

/** Public instance interface for config nodes. Implemented by {@link ConfigNode}. */
interface IConfigNode<TConfig = any, TCredentials = any, TSettings = any>
  extends INode<TConfig, TCredentials, TSettings>, ConfigNodeBrand {
  readonly config: ConfigNodeConfig<TConfig>;
  readonly credentials: ConfigNodeCredentials<TCredentials> | undefined;
  readonly userIds: string[];
  readonly users: INode[];
  getUser<T extends INode = INode>(index: number): T | undefined;
}

export type {
  ConfigNodeConfig,
  ConfigNodeContext,
  ConfigNodeCredentials,
  ConfigNodeContextScope,
  IConfigNode,
};
