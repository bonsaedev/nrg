import type { Static } from "@sinclair/typebox";
import type {
  NodeConfig,
  NodeCredentials,
  NodeContextScope,
  NodeContextStore,
} from "../../../server/nodes/types";
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

export {
  ConfigNodeConfig,
  ConfigNodeContext,
  ConfigNodeCredentials,
  ConfigNodeContextScope,
};
