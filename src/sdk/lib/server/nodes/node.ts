import type { Schema } from "../../shared/schemas";
import { type RED, type NodeRedNode } from "../red";
import type {
  ConfigNodeContext,
  INode,
  IONodeContext,
  NodeConfig,
  NodeConstructor,
  NodeCredentials,
} from "./types";
import { setupConfigProxy } from "./proxy";
import {
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
  NRG_NODE,
} from "../symbols";
import { NrgError } from "../../shared/errors";

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
  // Per-type settings, resolved from `RED.settings` and validated once by
  // `validateSettings` at registration; the instance `settings` getter returns
  // it. It's *assigned* (never mutated in place), so every node type gets its
  // own value with no cross-subclass sharing — a plain static, no cache needed.
  private static resolvedSettings?: Record<string, unknown>;

  public static registered?(RED: RED): void | Promise<void>;

  public static validateSettings(RED: RED): void {
    if (!this.settingsSchema) return;

    RED.log.info("Validating settings");
    const prefix = this.type.replace(/-./g, (x) => x[1].toUpperCase());
    const properties = this.settingsSchema.properties;
    const settings: Record<string, unknown> = {};

    // Gather each setting from Node-RED's flat settings namespace into the
    // schema shape. AJV can't do this — it doesn't know the `<camelCaseType><Key>`
    // convention (e.g. `myNodeApiEndpoint` -> `apiEndpoint`).
    for (const key of Object.keys(properties)) {
      const settingKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
      const value = RED.settings[settingKey];

      if (value !== undefined) {
        settings[key] = value;
      }
    }

    // The one default AJV can't inject: non-validatable fields (Function,
    // Constructor, ...) have their `type` stripped and their `default` moved to
    // `_default` by markNonValidatable, so AJV skips them. Must run BEFORE
    // validate — `required` is still enforced for these fields, so the value has
    // to be present by the time AJV checks. (JSON defaults are handled by AJV's
    // useDefaults during validate below, which likewise satisfies `required`.)
    for (const [key, prop] of Object.entries(properties) as [
      string,
      Record<string, unknown>,
    ][]) {
      if (settings[key] === undefined && prop._default !== undefined) {
        settings[key] = prop._default;
      }
    }

    // Coerces types and injects JSON defaults in place (mutate defaults to true
    // -> the coercing AJV with useDefaults), then validates.
    RED.validator.validate(settings, this.settingsSchema, {
      throwOnError: true,
    });

    this.resolvedSettings = settings;
    RED.log.info("Settings are valid");
  }

  protected readonly RED!: RED;
  protected readonly node!: NodeRedNode;
  protected context!: ConfigNodeContext | IONodeContext;
  public readonly config!: NodeConfig<TConfig>;

  readonly #timers = new Set<NodeJS.Timeout>();
  readonly #intervals = new Set<NodeJS.Timeout>();

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
      this.node.log("Validating configs");
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
        this.node.warn(
          `Config validation errors: ${configResult.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`,
        );
      }
    }
    // The proxy resolves NodeRef/TypedInput fields, so its type is
    // `ResolvedStatic<NodeConfig<…>>`; `config` is declared as the logical
    // `NodeConfig<…>`. `lockField` erased this gap via its `unknown` value param;
    // now that it's a plain assignment, state the narrowing explicitly.
    this.config = setupConfigProxy({
      RED,
      node,
      config,
      schema: constructor.configSchema,
    }) as NodeConfig<TConfig>;

    if (constructor.credentialsSchema && credentials) {
      this.node.log("Validating credentials");
      const credResult = this.RED.validator.validate(
        credentials,
        constructor.credentialsSchema,
        {
          throwOnError: false,
        },
      );
      if (!credResult.valid && credResult.errors?.length) {
        this.node.warn(
          `Credentials validation errors: ${credResult.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`,
        );
      }
    }
  }

  // Wires the `close` handler, common to every node kind. IONode adds the `input`
  // handler separately (NRG_SETUP_INPUT_HANDLER), so this setup carries none of the
  // input-only `createdPromise`.
  [NRG_SETUP_CLOSE_HANDLER]() {
    this.node.on(
      "close",
      async (removed: boolean, done: (err?: Error) => void) => {
        try {
          this.node.log("Calling closed");
          await this.#closed(removed);
          this.node.log("Node was closed");
          done();
        } catch (error) {
          if (error instanceof Error) {
            this.node.error("Error while closing node: " + error.message);
            done(error);
          } else {
            this.node.error("Unknown error occurred while closing node");
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
      this.node.log("clearing timers and intervals");
      this.#timers.forEach((t) => clearTimeout(t));
      this.#intervals.forEach((i) => clearInterval(i));
      this.#timers.clear();
      this.#intervals.clear();
      this.node.log("timers and intervals cleared");
    }
  }

  public i18n(key: string, substitutions?: Record<string, string>): string {
    const nodeType = (this.constructor as typeof Node).type;
    return this.RED._(`${nodeType}.${key}`, substitutions);
  }

  public setTimeout(fn: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.#timers.delete(timer);
      fn();
    }, ms);
    this.#timers.add(timer);
    return timer;
  }

  public setInterval(fn: () => void, ms: number): NodeJS.Timeout {
    const interval = setInterval(fn, ms);
    this.#intervals.add(interval);
    return interval;
  }

  public clearTimeout(timer: NodeJS.Timeout): void {
    clearTimeout(timer);
    this.#timers.delete(timer);
  }

  public clearInterval(interval: NodeJS.Timeout): void {
    clearInterval(interval);
    this.#intervals.delete(interval);
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
    return (constructor.resolvedSettings as TSettings) ?? ({} as TSettings);
  }
}

export { Node };
