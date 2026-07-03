import type { Schema } from "../../shared/schemas";
import { type RED, type NodeRedNode } from "../red";
import type {
  ConfigNodeContext,
  INode,
  IONodeContext,
  NodeConfig,
  NodeConstructor,
  NodeCredentials,
  NodeSettings,
} from "./types";
import { setupConfigProxy } from "./proxy";
import { getCredentialsFromSchema } from "../../shared/schemas/utils";
import { NRG_WIRE_HANDLERS, NRG_NODE } from "./symbols";
import { NrgError } from "../../shared/errors";

/** Module-scoped cache for validated settings, keyed by constructor. */
const cachedSettingsMap = new WeakMap<typeof Node, unknown>();

/**
 * Abstract base class for all NRG nodes. Provides lifecycle hooks, config
 * validation, logging, timers, i18n, and settings management.
 *
 * Extend {@link IONode} for message-processing nodes or {@link ConfigNode}
 * for shared configuration nodes.
 *
 * @typeParam TConfig - config shape (position 1)
 * @typeParam TCredentials - credentials shape (position 2)
 * @typeParam TSettings - settings shape (position 3) — note this is position
 *   **5** on {@link IONode} (which inserts `TInput`/`TOutput` at 3/4).
 */
abstract class Node<
  TConfig = any,
  TCredentials = any,
  TSettings = any,
> implements INode<TConfig, TCredentials, TSettings> {
  /**
   * Runtime NRG-node brand — inherited by every subclass (IONode/ConfigNode and
   * factory-built classes) and checked by `defineModule` at runtime. See
   * symbols.ts for why it's a `Symbol.for()` runtime key, not a compile-time brand.
   */
  static readonly [NRG_NODE] = true;

  public static readonly type: string;
  public static readonly category: "config" | string;
  public static readonly configSchema?: Schema;
  public static readonly credentialsSchema?: Schema;
  public static readonly settingsSchema?: Schema;

  public static registered?(RED: RED): void | Promise<void>;

  public static validateSettings(RED: RED): void {
    if (!this.settingsSchema) return;

    RED.log.info("Validating settings");
    const prefix = this.type.replace(/-./g, (x) => x[1].toUpperCase());
    const properties = this.settingsSchema.properties;
    const settings: Record<string, unknown> = {};

    for (const key of Object.keys(properties)) {
      const settingKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
      const value = RED.settings[settingKey];

      if (value !== undefined) {
        settings[key] = value;
      }
    }

    // NOTE: assign defaults manually to avoid ajv errors for non json types (eg. Function, Constructor)
    for (const [key, prop] of Object.entries(properties) as [
      string,
      Record<string, unknown>,
    ][]) {
      if (settings[key] === undefined) {
        // NOTE: here I need to use _default when it is a non validatable type (eg. Function, Constructor...)
        const defaultValue = prop.default ?? prop._default;
        if (defaultValue !== undefined) {
          settings[key] = defaultValue;
        }
      }
    }

    RED.validator.validate(settings, this.settingsSchema, {
      throwOnError: true,
    });

    cachedSettingsMap.set(this, settings);

    RED.log.info("Settings are valid");
  }

  static #buildSettings(NC: typeof Node): NodeSettings | undefined {
    if (!NC.settingsSchema) return;

    const settings: NodeSettings = {};
    const prefix = NC.type.replace(/-./g, (x) => x[1].toUpperCase());
    for (const [key, prop] of Object.entries(NC.settingsSchema.properties)) {
      const settingKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
      settings[settingKey] = {
        value: prop.default,
        exportable: prop.exportable ?? false,
      };
    }
    return settings;
  }

  /**
   * Registers this node class with Node-RED. Handles instance creation,
   * event handler wiring, settings validation, and the user's registered() hook.
   */
  static async register(RED: RED) {
    const NodeClass = this as unknown as NodeConstructor;

    if (NodeClass.color && !/^#[0-9A-Fa-f]{6}$/.test(NodeClass.color)) {
      throw new NrgError(
        `Invalid color "${NodeClass.color}" for ${NodeClass.type}: must be a 6-digit hex color like "#a6bbcf" (shorthand "#abc" is not accepted).`,
      );
    }

    RED.nodes.registerType(
      NodeClass.type,
      function (this: NodeRedNode, config: Record<string, any>) {
        RED.nodes.createNode(this, config);
        const node = new NodeClass(RED, this, config, this.credentials);
        // NOTE: save node instance inside node-red's node so that the proxy can resolve it lazily.
        // Non-writable to prevent accidental clobbering by other code in the process.
        Object.defineProperty(this, "_node", {
          value: node,
          writable: false,
          configurable: false,
          enumerable: false,
        });

        // NOTE: created promise must be here because we only want it to start after the whole object creation chain has been completed: child -> IONode -> Node -> IONode -> child -> done
        const createdPromise = Promise.resolve(node.created?.()).catch(
          (error: unknown) => {
            const message =
              error instanceof Error ? error.message : String(error);
            this.error("Error during created hook: " + message);
            throw error;
          },
        );
        // Surface a failed created() as an error status, not just a log. A node
        // with inputs also reports the failure per-input via done(), but an
        // input-less node has no handler awaiting createdPromise, so without
        // this its created() rejection would be logged once and otherwise
        // silently swallowed while the node stays registered.
        createdPromise.catch(() => {
          this.status({ fill: "red", shape: "ring", text: "created() failed" });
        });

        node[NRG_WIRE_HANDLERS](this, createdPromise);
      },
      {
        credentials: NodeClass.credentialsSchema
          ? getCredentialsFromSchema(NodeClass.credentialsSchema)
          : {},
        settings: Node.#buildSettings(this),
      },
    );

    NodeClass.validateSettings(RED);
    // Isolation contract: a failing `registered()` hook is logged at error level
    // and swallowed, NOT rethrown. Registration runs one shared loop over every
    // node class in the package (see registerTypes), so rethrowing here would
    // abort registration of all *other* node types in the same package. The hook
    // is for optional one-time setup; a node whose hook fails still registers.
    try {
      await Promise.resolve(NodeClass.registered?.(RED));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      RED.log.error(
        `Error during registered hook for ${NodeClass.type}: ${message}`,
      );
    }
  }

  protected readonly RED: RED;
  protected readonly node: NodeRedNode;
  protected readonly context!: ConfigNodeContext | IONodeContext;
  public readonly config!: NodeConfig<TConfig>;

  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly intervals = new Set<NodeJS.Timeout>();

  constructor(
    RED: RED,
    node: NodeRedNode,
    config: NodeConfig<TConfig>,
    credentials: NodeCredentials<TCredentials>,
  ) {
    this.RED = RED;
    this.node = node;

    const constructor = this.constructor as typeof Node;
    if (constructor.configSchema) {
      this.log("Validating configs");
      const configResult = this.RED.validator.validate(
        config,
        constructor.configSchema,
        {
          // Coercing (default): the proxy at (this).config wraps this same object,
          // so `this.config.<field>` must read as its coerced/typed value.
          throwOnError: false,
        },
      );
      if (!configResult.valid && configResult.errors?.length) {
        this.warn(
          `Config validation errors: ${configResult.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`,
        );
      }
    }
    (this as any).config = setupConfigProxy({
      RED,
      node,
      config,
      schema: constructor.configSchema,
    });

    if (constructor.credentialsSchema && credentials) {
      this.log("Validating credentials");
      const credResult = this.RED.validator.validate(
        credentials,
        constructor.credentialsSchema,
        {
          throwOnError: false,
        },
      );
      if (!credResult.valid && credResult.errors?.length) {
        this.warn(
          `Credentials validation errors: ${credResult.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`,
        );
      }
    }
  }

  [NRG_WIRE_HANDLERS](nodeRedNode: NodeRedNode, createdPromise: Promise<void>) {
    nodeRedNode.on(
      "close",
      async (removed: boolean, done: (err?: Error) => void) => {
        try {
          this.log("Calling closed");
          await this.#closed(removed);
          this.log("Node was closed");
          done();
        } catch (error) {
          if (error instanceof Error) {
            this.error("Error while closing node: " + error.message);
            done(error);
          } else {
            this.error("Unknown error occurred while closing node");
            done(new Error("Unknown error occurred while closing node"));
          }
        }
      },
    );
  }

  async #closed(removed?: boolean) {
    try {
      await Promise.resolve(this.closed?.(removed));
    } finally {
      this.log("clearing timers and intervals");
      this.timers.forEach((t) => clearTimeout(t));
      this.intervals.forEach((i) => clearInterval(i));
      this.timers.clear();
      this.intervals.clear();
      this.log("timers and intervals cleared");
    }
  }

  public i18n(key: string, substitutions?: Record<string, string>): string {
    const nodeType = (this.constructor as typeof Node).type;
    return this.RED._(`${nodeType}.${key}`, substitutions);
  }

  public setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      fn();
    }, ms);
    this.timers.add(timer);
    return timer;
  }

  public setInterval(fn: () => void, ms: number): NodeJS.Timeout {
    const interval = setInterval(fn, ms);
    this.intervals.add(interval);
    return interval;
  }

  public clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.timers.delete(timer);
  }

  public clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.intervals.delete(interval);
  }

  public created?(): void | Promise<void>;
  public closed?(removed?: boolean): void | Promise<void>;

  public on(event: string, callback: (...args: any[]) => void) {
    this.node.on(event, callback);
  }

  public log(msg: any) {
    this.node.log(msg);
  }

  public warn(message: string) {
    this.node.warn(message);
  }

  public error(message: string, msg?: any) {
    this.node.error(message, msg);
  }

  public get id(): string {
    return this.node.id;
  }

  public get name(): string | undefined {
    return this.node.name;
  }

  public get z(): string | undefined {
    return this.node.z;
  }

  public get credentials(): NodeCredentials<TCredentials> | undefined {
    return this.node.credentials;
  }

  public get settings(): TSettings {
    const constructor = this.constructor as typeof Node;
    return (
      (cachedSettingsMap.get(constructor) as TSettings) ?? ({} as TSettings)
    );
  }
}

export { Node };
