import type { RED, NodeRedNode } from "../red";
import { Node } from "./node";
import { NRG_CONFIG_NODE } from "./symbols";
import type {
  ConfigNodeConfig,
  ConfigNodeContext,
  ConfigNodeCredentials,
  IConfigNode,
  INode,
} from "./types";
import { setupContext } from "./context";

/**
 * Base class for configuration nodes that are shared across multiple nodes
 * (e.g., server connections, credentials). Registered with `category: "config"`.
 *
 * @example
 * ```ts
 * export default class MyServer extends ConfigNode<Config> {
 *   static readonly type = "my-server";
 * }
 * ```
 *
 * @typeParam TConfig - config shape (position 1)
 * @typeParam TCredentials - credentials shape (position 2)
 * @typeParam TSettings - settings shape (position 3) — same order as
 *   {@link Node}; {@link IONode} differs (settings is at position 5 there).
 */
abstract class ConfigNode<TConfig = any, TCredentials = any, TSettings = any>
  extends Node<TConfig, TCredentials, TSettings>
  implements IConfigNode<TConfig, TCredentials, TSettings>
{
  public static override readonly category: string = "config";
  declare public readonly config: ConfigNodeConfig<TConfig>;

  // Compile-time brand (type-only phantom) so `SchemaType.NodeRef<T>` can require
  // T to be a config node. See ConfigNodeBrand in shared/schemas/types.
  declare public readonly __nrg_config_node: true;

  // Runtime counterpart: a real property so runtime code (the config proxy's
  // NodeRef resolution) can verify a referenced node is a config node — the only
  // guard a JS author gets. See NRG_CONFIG_NODE in ./symbols.
  public readonly [NRG_CONFIG_NODE] = true;

  declare protected readonly context: ConfigNodeContext;

  constructor(
    RED: RED,
    node: NodeRedNode,
    config: ConfigNodeConfig<TConfig>,
    credentials: ConfigNodeCredentials<TCredentials>,
  ) {
    super(RED, node, config, credentials);

    const context = node.context();
    const resolve = (scope: "node" | "global", store?: string) => {
      const target = scope === "global" ? context.global : context;
      return setupContext(target, store);
    };

    this.context = Object.assign(resolve, {
      node: setupContext(context),
      global: setupContext(context.global),
    });
  }

  get userIds(): string[] {
    return this.config._users;
  }

  get users(): INode[] {
    return this.userIds
      .map((id) => this.RED.nodes.getNode(id)?._node)
      .filter((node): node is INode => node != null);
  }

  getUser<T extends INode = INode>(index: number): T | undefined {
    const id = this.userIds[index];
    if (!id) return undefined;
    return this.RED.nodes.getNode(id)?._node as T | undefined;
  }

  override get credentials(): ConfigNodeCredentials<TCredentials> | undefined {
    return this.node.credentials;
  }
}

export { ConfigNode };
