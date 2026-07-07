import type { Schema } from "../../shared/schemas";
import { markNonValidatable } from "../../shared/schemas/factories";
import type { RED } from "../red";
import type {
  IONodeDefinition,
  ConfigNodeDefinition,
  NodeConstructor,
  IConfigNode,
  IIONode,
  HexColor,
} from "./types";
import { IONode } from "./io-node";
import { ConfigNode } from "./config-node";

/**
 * Equalize schemas built with a raw `SchemaType.Object` against ones built with
 * `defineSchema`: run `markNonValidatable` on every schema the node declares so
 * a non-JSON type (Function, …) is stripped for AJV regardless of how the schema
 * was authored. `defineSchema` already did this, so it's a no-op there
 * (idempotent). Runs once at class-definition time — before every validation
 * path (register/settings, construct-time config/creds). Input/output data
 * validation schemas live in the config schema, so they're covered by the config
 * entry here.
 */
function normalizeSchemas(schemas: Array<Schema | undefined>): void {
  for (const schema of schemas) {
    if (schema) markNonValidatable(schema);
  }
}

/**
 * Creates an IO node class from a definition object. Provides automatic type
 * inference from schemas, reducing boilerplate compared to the class-based API.
 *
 * @example
 * ```ts
 * export default defineIONode({
 *   type: "my-node",
 *   color: "#ffffff",
 *   configSchema: ConfigsSchema,
 *   inputSchema: InputSchema,
 *   outputsSchema: OutputSchema,
 *   async input(msg) {
 *     this.send({ payload: msg.payload.toUpperCase() });
 *   },
 * });
 * ```
 */
function defineIONode<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
>(
  def: IONodeDefinition<TConfig, TCredentials, TInput, TOutput, TSettings>,
): NodeConstructor<IIONode<TConfig, TCredentials, TInput, TOutput, TSettings>> {
  const NodeClass = class extends IONode<
    TConfig,
    TCredentials,
    TInput,
    TOutput,
    TSettings
  > {
    static override readonly type: string = def.type;
    static override readonly category: string = def.category ?? "function";
    static override readonly color: HexColor = def.color ?? "#a6bbcf";
    static override readonly align = def.align;

    static override readonly configSchema: Schema | undefined =
      def.configSchema;
    static override readonly credentialsSchema: Schema | undefined =
      def.credentialsSchema;
    static override readonly settingsSchema: Schema | undefined =
      def.settingsSchema;

    static override registered(RED: RED) {
      return def.registered?.(RED);
    }

    override async input(msg: TInput) {
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

  normalizeSchemas([
    NodeClass.configSchema,
    NodeClass.credentialsSchema,
    NodeClass.settingsSchema,
  ]);

  return NodeClass as unknown as NodeConstructor<
    IIONode<TConfig, TCredentials, TInput, TOutput, TSettings>
  >;
}

/**
 * Creates a config node class from a definition object.
 *
 * @example
 * ```ts
 * export default defineConfigNode({
 *   type: "my-server",
 *   configSchema: ConfigsSchema,
 *   credentialsSchema: CredsSchema,
 * });
 * ```
 */
function defineConfigNode<TConfig = any, TCredentials = any, TSettings = any>(
  def: ConfigNodeDefinition<TConfig, TCredentials, TSettings>,
): NodeConstructor<IConfigNode<TConfig, TCredentials>> {
  const NodeClass = class extends ConfigNode<TConfig, TCredentials, TSettings> {
    static override readonly type: string = def.type;

    static override readonly configSchema: Schema | undefined =
      def.configSchema;
    static override readonly credentialsSchema: Schema | undefined =
      def.credentialsSchema;
    static override readonly settingsSchema: Schema | undefined =
      def.settingsSchema;

    static override registered(RED: RED) {
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

  normalizeSchemas([
    NodeClass.configSchema,
    NodeClass.credentialsSchema,
    NodeClass.settingsSchema,
  ]);

  return NodeClass as unknown as NodeConstructor<
    IConfigNode<TConfig, TCredentials>
  >;
}

export { defineIONode, defineConfigNode };
