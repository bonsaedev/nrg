import { type Static, type TSchema } from "@sinclair/typebox";
import type { RED } from "../../types";
import type { Schema } from "../../schemas/types";
import type { IONode } from "../io-node";
import type { ConfigNode } from "../config-node";
import type { HexColor, IONodeConfig, IONodeCredentials } from "./io-node";
import type { ConfigNodeConfig, ConfigNodeCredentials } from "./config-node";

type InferOr<T, Fallback> = T extends TSchema ? Static<T> : Fallback;

type InferOutputs<T> = T extends readonly TSchema[]
  ? { [K in keyof T]: T[K] extends TSchema ? Static<T[K]> : never }
  : T extends TSchema
    ? Static<T>
    : any;

type BoundIONode<
  TC extends TSchema | undefined,
  TCr extends TSchema | undefined,
  TS extends TSchema | undefined,
  TIn extends TSchema | undefined,
  TOut extends TSchema | readonly TSchema[] | undefined,
> = IONode<
  InferOr<TC, any>,
  InferOr<TCr, any>,
  InferOr<TIn, any>,
  InferOutputs<TOut>,
  InferOr<TS, any>
>;

type BoundConfigNode<
  TC extends TSchema | undefined,
  TCr extends TSchema | undefined,
  TS extends TSchema | undefined,
> = ConfigNode<InferOr<TC, any>, InferOr<TCr, any>, InferOr<TS, any>>;

// Public-only instance projections — avoids TS4094 by not exposing
// private/protected members (RED, node, timers, etc.) in declaration emit.
interface ConfigNodeInstance<TConfig = any, TCredentials = any> {
  readonly config: ConfigNodeConfig<TConfig>;
  readonly credentials: ConfigNodeCredentials<TCredentials> | undefined;
  readonly id: string;
  readonly name: string | undefined;
}

interface IONodeInstance<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
> {
  readonly config: IONodeConfig<TConfig>;
  readonly credentials: IONodeCredentials<TCredentials> | undefined;
  readonly id: string;
  readonly name: string | undefined;
  input(msg: TInput): void | Promise<void>;
  send(msg: TOutput): void;
  /** @internal */
  readonly _baseOutputs: number;
  /** @internal */
  readonly _totalOutputs: number;
  /** @internal */
  _getErrorPortIndex(): number | null;
  /** @internal */
  _getCompletePortIndex(): number | null;
  /** @internal */
  _getStatusPortIndex(): number | null;
}

interface IONodeDefinition<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
  TInputSchema extends TSchema | undefined = undefined,
  TOutputsSchema extends TSchema | readonly TSchema[] | undefined = undefined,
> {
  type: string;
  category?: string;
  color?: HexColor;
  align?: "left" | "right";

  configSchema?: TConfigSchema;
  credentialsSchema?: TCredsSchema;
  settingsSchema?: TSettingsSchema;
  inputSchema?: TInputSchema;
  outputsSchema?: TOutputsSchema;

  validateInput?: boolean;
  validateOutput?: boolean;

  registered?(RED: RED): void | Promise<void>;
  created?(
    this: BoundIONode<
      TConfigSchema,
      TCredsSchema,
      TSettingsSchema,
      TInputSchema,
      TOutputsSchema
    >,
  ): void | Promise<void>;
  closed?(
    this: BoundIONode<
      TConfigSchema,
      TCredsSchema,
      TSettingsSchema,
      TInputSchema,
      TOutputsSchema
    >,
    removed?: boolean,
  ): void | Promise<void>;
  input?(
    this: BoundIONode<
      TConfigSchema,
      TCredsSchema,
      TSettingsSchema,
      TInputSchema,
      TOutputsSchema
    >,
    msg: InferOr<TInputSchema, any>,
  ): void | Promise<void>;
}

interface ConfigNodeDefinition<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
> {
  type: string;

  configSchema?: TConfigSchema;
  credentialsSchema?: TCredsSchema;
  settingsSchema?: TSettingsSchema;

  registered?(RED: RED): void | Promise<void>;
  created?(
    this: BoundConfigNode<TConfigSchema, TCredsSchema, TSettingsSchema>,
  ): void | Promise<void>;
  closed?(
    this: BoundConfigNode<TConfigSchema, TCredsSchema, TSettingsSchema>,
    removed?: boolean,
  ): void | Promise<void>;
}

// Return types for factory functions — uses structural typing to avoid
// referencing internal class paths in declaration emit, while preserving
// the instance type for NodeRef inference.
interface NodeClassBase<TInstance = unknown> {
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
  readonly outputsSchema?: Schema | Schema[];
  readonly validateInput?: boolean;
  readonly validateOutput?: boolean;
  readonly name: string;
  new (...args: any[]): TInstance;
}

export type {
  InferOr,
  InferOutputs,
  IONodeDefinition,
  ConfigNodeDefinition,
  NodeClassBase,
  ConfigNodeInstance,
  IONodeInstance,
};
