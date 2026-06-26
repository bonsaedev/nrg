import type { Static, TSchema } from "@sinclair/typebox";
import type { Schema } from "../../schemas/types";
import type { NodeConfigSchema } from "../../schemas";
import type { RED, NodeRedNode } from "../../../server/types";

type NodeContextScope = "node" | "flow" | "global";

interface NodeContextStore {
  get<T = any>(key: string): Promise<T>;
  set<T = any>(key: string, value: T): Promise<void>;
  keys(): Promise<string[]>;
  /**
   * Atomically add `by` (default 1) to a numeric key and return the new value.
   * Prefer this over `get`+`set` for counters: it's atomic across instances when
   * the context store supports it (e.g. a DynamoDB `ADD` or Redis `INCR` store),
   * and serialized within the process otherwise — so concurrent messages never
   * lose updates.
   */
  increment(key: string, by?: number): Promise<number>;
  /**
   * Atomic read-modify-write: `fn(current)` returns the next value, applied
   * atomically (a conditional write + retry on a capable store, a per-key lock
   * otherwise). `fn` MAY run more than once on a write conflict, so keep it pure
   * (no side effects).
   */
  update<T = any>(key: string, fn: (current: T) => T | Promise<T>): Promise<T>;
}

interface NodeConstructor<T = any, TConfig = any, TCredentials = any> {
  readonly type: string;
  readonly category: string;
  readonly color?: string;
  readonly align?: "left" | "right";
  readonly inputs?: number;
  readonly outputs?: number;
  readonly configSchema?: Schema;
  readonly credentialsSchema?: Schema;
  readonly settingsSchema?: Schema;
  readonly inputSchema?: Schema;
  // any schema shape: the raw sent value (per output port) is validated,
  // and results are frequently non-objects
  readonly outputsSchema?: TSchema | TSchema[] | Record<string, TSchema>;
  readonly validateInput?: boolean;
  readonly validateOutput?: boolean;
  readonly name: string;
  registered?(RED: RED): void | Promise<void>;
  register(RED: RED): void | Promise<void>;
  validateSettings(RED: RED): void;
  new (
    RED: RED,
    node: NodeRedNode,
    config: NodeConfig<TConfig>,
    credentials: NodeCredentials<TCredentials>,
  ): T;
}

type NodeConfig<TConfig = any> = TConfig & Static<typeof NodeConfigSchema>;

type NodeCredentials<TCredentials = any> = TCredentials;

interface NodeSetting<T = any> {
  value: T;
  exportable?: boolean;
}

type NodeSettings = Record<string, NodeSetting>;

/** Public instance interface for all NRG nodes. Implemented by {@link Node}. */
interface INode<TConfig = any, TCredentials = any, TSettings = any> {
  readonly config: NodeConfig<TConfig>;
  readonly id: string;
  readonly name: string | undefined;
  readonly z: string | undefined;
  readonly credentials: NodeCredentials<TCredentials> | undefined;
  readonly settings: TSettings;

  i18n(key: string, substitutions?: Record<string, string>): string;
  setTimeout(fn: () => void, ms: number): NodeJS.Timeout;
  setInterval(fn: () => void, ms: number): NodeJS.Timeout;
  clearTimeout(timer: NodeJS.Timeout): void;
  clearInterval(interval: NodeJS.Timeout): void;
  on(event: string, callback: (...args: any[]) => void): void;
  log(msg: any): void;
  warn(message: string): void;
  error(message: string, msg?: any): void;

  created?(): void | Promise<void>;
  closed?(removed?: boolean): void | Promise<void>;
}

export {
  INode,
  NodeConfig,
  NodeContextStore,
  NodeContextScope,
  NodeConstructor,
  NodeCredentials,
  NodeSetting,
  NodeSettings,
};
