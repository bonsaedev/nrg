import type { Schema } from "../schemas/types";
import { type RED, type NodeRedNode } from "../../server/types";
import type {
  ConfigNodeContext,
  IONodeContext,
  NodeConfig,
  NodeCredentials,
  TypedInput,
  NodeSettings,
} from "./types";
import { validator } from "../validator";
import { setupConfigProxy } from "./utils";

abstract class Node<TConfig = any, TCredentials = any, TSettings = any> {
  public static readonly type: string;
  public static readonly category: "config" | string;
  public static readonly configSchema?: Schema;
  public static readonly credentialsSchema?: Schema;
  public static readonly settingsSchema?: Schema;

  private static _cachedSettings: any = null;

  public static registered?(RED: RED): void | Promise<void>;

  /** @internal */
  public static _registered?(RED: RED): void | Promise<void>;

  /** @internal */
  public static _settings(): NodeSettings | undefined {
    if (!this.settingsSchema) return;

    const settings: NodeSettings = {};
    const prefix = this.type.replace(/-./g, (x) => x[1].toUpperCase());
    for (const [key, prop] of Object.entries(this.settingsSchema.properties)) {
      const settingKey = prefix + key.charAt(0).toUpperCase() + key.slice(1);
      settings[settingKey] = {
        value: prop.default,
        exportable: prop.exportable ?? false,
      };
    }
    return settings;
  }

  // NOTE:
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
    for (const [key, prop] of Object.entries(properties) as [string, any][]) {
      if (settings[key] === undefined) {
        // NOTE: here I need to use _default when it is a non validatable type (eg. Function, Constructor...)
        const defaultValue = prop.default ?? prop._default;
        if (defaultValue !== undefined) {
          settings[key] = defaultValue;
        }
      }
    }

    validator.validate(settings, this.settingsSchema, {
      cacheKey: this.settingsSchema.$id || `${this.type}:settings`,
      throwOnError: true,
    });

    this._cachedSettings = settings;

    RED.log.info("Settings are valid");
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
      const configResult = validator.validate(
        config,
        constructor.configSchema,
        {
          cacheKey:
            constructor.configSchema.$id ||
            `${constructor.type}:configs-schema`,
          throwOnError: false,
        },
      );
      if (!configResult.valid && configResult.errors?.length) {
        this.warn(
          `Config validation errors: ${configResult.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ")}`,
        );
      }
    }
    (this as any).config = setupConfigProxy(
      RED,
      config,
      constructor.configSchema,
    );

    if (constructor.credentialsSchema && credentials) {
      this.log("Validating credentials");
      const credResult = validator.validate(
        credentials,
        constructor.credentialsSchema,
        {
          cacheKey:
            constructor.credentialsSchema.$id ||
            `${constructor.type}:credentials-schema`,
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

  // NOTE: typing msg isnt necessary in this case
  public resolveTypedInput<T = any>(
    typedInput: TypedInput,
    msg?: Record<string, any>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.RED.util.evaluateNodeProperty(
        typedInput.value,
        typedInput.type,
        this.node,
        msg,
        (error: Error | null, result: any) => {
          if (error) {
            reject(error);
            return;
          }

          // NOTE: some references might have not been written with the nrg framework
          // TODO: type with NodeRedNode for nodes that don't have types
          if (typedInput.type === "node" && result) {
            resolve((result._node ?? result) as T);
            return;
          }

          resolve(result as T);
        },
      );
    });
  }
  // NOTE: used by the registered function. Had to be a different one to avoid calling the parent's closed again
  /** @internal */
  public async _closed(removed?: boolean) {
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
    return (constructor._cachedSettings as TSettings) ?? ({} as TSettings);
  }
}

export { Node };
