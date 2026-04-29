import { type Static, type TSchema } from "@sinclair/typebox";
import type { RED } from "../../types";
import type { IONode } from "../io-node";
import type { ConfigNode } from "../config-node";
import type { HexColor } from "./io-node";

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
  inputs?: 0 | 1;
  outputs?: number;
  paletteLabel?: string;
  inputLabels?: string | string[];
  outputLabels?: string | string[];
  align?: "left" | "right";
  labelStyle?: string;

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
  input(
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

export type { InferOr, InferOutputs, IONodeDefinition, ConfigNodeDefinition };
