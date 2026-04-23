import type { Static } from "@sinclair/typebox";
import type { IONodeConfigSchema } from "../../schemas";
import type {
  NodeConfig,
  NodeCredentials,
  NodeContextStore,
  NodeContextScope,
} from "../../../server/nodes/types";

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

export {
  IONodeConfig,
  IONodeContext,
  IONodeContextScope,
  IONodeCredentials,
  IONodeStatus,
};
