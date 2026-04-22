import type { Static } from "@sinclair/typebox";
import type { NodeConfigSchema, TTypedInput } from "../../../schemas";
import type { RED } from "../../../server/types";
type NodeContextScope = "node" | "flow" | "global";
interface NodeContextStore {
    get<T = any>(key: string): Promise<T>;
    set<T = any>(key: string, value: T): Promise<void>;
    keys(): Promise<string[]>;
}
type NodeConstructor<T = any> = (new (...args: any[]) => T) & {
    type: string;
    registered?(RED: RED): void | Promise<void>;
};
type NodeConfig<TConfig = any> = TConfig & Static<typeof NodeConfigSchema>;
type NodeCredentials<TCredentials = any> = TCredentials;
interface NodeSetting<T = any> {
    value: T;
    exportable?: boolean;
}
type NodeSettings = Record<string, NodeSetting>;
type TypedInput = Static<TTypedInput>;
export { NodeConfig, NodeContextStore, NodeContextScope, NodeConstructor, NodeCredentials, NodeSetting, NodeSettings, TypedInput, };
