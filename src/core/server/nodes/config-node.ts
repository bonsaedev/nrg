import type { RED } from "../../server/types";
import { Node } from "./node";
import type {
  ConfigNodeConfig,
  ConfigNodeContext,
  ConfigNodeCredentials,
} from "./types";
import { setupContext } from "./utils";

abstract class ConfigNode<
  TConfig = any,
  TCredentials = any,
  TSettings = any,
> extends Node<TConfig, TCredentials, TSettings> {
  public static override readonly category: string = "config";
  declare public readonly config: ConfigNodeConfig<TConfig>;

  protected override readonly context: ConfigNodeContext;

  // NOTE: used by the registered function. Had to be a different one to avoid calling the parent's input again
  /** @internal */
  public static override _registered(RED: RED): void | Promise<void> {
    this.validateSettings(RED);
    return this.registered?.(RED);
  }

  constructor(
    RED: RED,
    node: any,
    config: ConfigNodeConfig<TConfig>,
    credentials: ConfigNodeCredentials<TCredentials>,
  ) {
    super(RED, node, config, credentials);

    const context = node.context();
    const fn = (scope: "node" | "global", store?: string) => {
      const target = scope === "global" ? context.global : context;
      return setupContext(target, store);
    };
    fn.node = setupContext(context);
    fn.global = setupContext(context.global);

    this.context = fn as any;
  }

  get userIds(): string[] {
    return this.config._users;
  }

  get users(): Node[] {
    return this.userIds
      .map((id) => this.RED.nodes.getNode(id)?._node)
      .filter((node): node is Node => node != null);
  }

  getUser<T extends Node = Node>(index: number): T | undefined {
    const id = this.userIds[index];
    if (!id) return undefined;
    return this.RED.nodes.getNode(id)?._node as T | undefined;
  }

  override get credentials(): ConfigNodeCredentials<TCredentials> | undefined {
    return this.node.credentials;
  }
}

export { ConfigNode };
