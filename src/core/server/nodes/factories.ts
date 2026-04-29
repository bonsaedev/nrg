import { type TSchema } from "@sinclair/typebox";
import type { Schema } from "../schemas/types";
import type { RED } from "../types";
import type {
  InferOr,
  InferOutputs,
  IONodeDefinition,
  ConfigNodeDefinition,
  NodeClassBase,
  HexColor,
} from "./types";
import { IONode } from "./io-node";
import { ConfigNode } from "./config-node";

function defineIONode<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
  TInputSchema extends TSchema | undefined = undefined,
  TOutputsSchema extends TSchema | readonly TSchema[] | undefined = undefined,
>(
  def: IONodeDefinition<
    TConfigSchema,
    TCredsSchema,
    TSettingsSchema,
    TInputSchema,
    TOutputsSchema
  >,
): NodeClassBase {
  const NodeClass = class extends IONode<
    InferOr<TConfigSchema, any>,
    InferOr<TCredsSchema, any>,
    InferOr<TInputSchema, any>,
    InferOutputs<TOutputsSchema>,
    InferOr<TSettingsSchema, any>
  > {
    static override readonly type: string = def.type;
    static override readonly category: string = def.category ?? "function";
    static override readonly color: HexColor = def.color ?? "#a6bbcf";
    static override readonly inputs: number = def.inputs ?? 1;
    static override readonly outputs: number = def.outputs ?? 1;
    static override readonly paletteLabel = def.paletteLabel;
    static override readonly inputLabels = def.inputLabels;
    static override readonly outputLabels = def.outputLabels;
    static override readonly align = def.align;
    static override readonly labelStyle = def.labelStyle;

    static override readonly configSchema: Schema | undefined =
      def.configSchema as Schema | undefined;
    static override readonly credentialsSchema: Schema | undefined =
      def.credentialsSchema as Schema | undefined;
    static override readonly settingsSchema: Schema | undefined =
      def.settingsSchema as Schema | undefined;
    static override readonly inputSchema: Schema | undefined =
      def.inputSchema as Schema | undefined;
    static override readonly outputsSchema: Schema | Schema[] | undefined =
      def.outputsSchema as Schema | Schema[] | undefined;
    static override readonly validateInput: boolean =
      def.validateInput ?? false;
    static override readonly validateOutput: boolean =
      def.validateOutput ?? false;

    static override _registered(RED: RED) {
      this.validateSettings(RED);
      return def.registered?.(RED);
    }

    async input(msg: InferOr<TInputSchema, any>) {
      if (def.input) return def.input.call(this as any, msg);
    }

    override async created() {
      if (def.created) return def.created.call(this as any);
    }

    override async closed(removed?: boolean) {
      if (def.closed) return def.closed.call(this as any, removed);
    }
  };

  Object.defineProperty(NodeClass, "name", {
    value: def.type.replace(/(^|-)(\w)/g, (_, __, c: string) =>
      c.toUpperCase(),
    ),
    configurable: true,
  });

  return NodeClass as unknown as NodeClassBase;
}

function defineConfigNode<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
>(
  def: ConfigNodeDefinition<TConfigSchema, TCredsSchema, TSettingsSchema>,
): NodeClassBase {
  const NodeClass = class extends ConfigNode<
    InferOr<TConfigSchema, any>,
    InferOr<TCredsSchema, any>,
    InferOr<TSettingsSchema, any>
  > {
    static override readonly type: string = def.type;

    static override readonly configSchema: Schema | undefined =
      def.configSchema as Schema | undefined;
    static override readonly credentialsSchema: Schema | undefined =
      def.credentialsSchema as Schema | undefined;
    static override readonly settingsSchema: Schema | undefined =
      def.settingsSchema as Schema | undefined;

    static override _registered(RED: RED) {
      this.validateSettings(RED);
      return def.registered?.(RED);
    }

    override async created() {
      if (def.created) return def.created.call(this as any);
    }

    override async closed(removed?: boolean) {
      if (def.closed) return def.closed.call(this as any, removed);
    }
  };

  Object.defineProperty(NodeClass, "name", {
    value: def.type.replace(/(^|-)(\w)/g, (_, __, c: string) =>
      c.toUpperCase(),
    ),
    configurable: true,
  });

  return NodeClass as unknown as NodeClassBase;
}

export { defineIONode, defineConfigNode };
