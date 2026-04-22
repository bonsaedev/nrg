import type { RED } from "../../server/types";
import { Node } from "./node";
import type { ConfigNodeConfig, ConfigNodeContext, ConfigNodeCredentials } from "./types";
declare abstract class ConfigNode<TConfig = any, TCredentials = any, TSettings = any> extends Node<TConfig, TCredentials, TSettings> {
    static readonly category: string;
    readonly config: ConfigNodeConfig<TConfig>;
    protected readonly context: ConfigNodeContext;
    constructor(RED: RED, node: any, config: ConfigNodeConfig<TConfig>, credentials: ConfigNodeCredentials<TCredentials>);
    get userIds(): string[];
    get users(): Node[];
    getUser<T extends Node = Node>(index: number): T | undefined;
    get credentials(): ConfigNodeCredentials<TCredentials> | undefined;
}
export { ConfigNode };
