import type { TSchema, Schema } from "../../shared/schemas";
import { Kind } from "../../shared/schemas";
import { markNonValidatable } from "../../shared/schemas/factories";
import type { InferOr, InferOutputs } from "../schemas/types";
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
 * path (register/settings, construct-time config/creds/input, send-time output).
 * `outputsSchema` is a single schema, a positional tuple, or a record of named
 * ports; `Kind` (present only on a schema) discriminates the single case from a
 * plain port record — the same test io-node uses.
 */
function normalizeSchemas(
  schemas: Array<Schema | undefined>,
  outputsSchema?: Schema | Schema[] | Record<string, Schema>,
): void {
  for (const schema of schemas) {
    if (schema) markNonValidatable(schema);
  }
  if (!outputsSchema) return;
  if (Array.isArray(outputsSchema)) {
    for (const schema of outputsSchema) markNonValidatable(schema);
  } else if (Kind in outputsSchema) {
    markNonValidatable(outputsSchema as Schema);
  } else {
    for (const schema of Object.values(outputsSchema)) {
      markNonValidatable(schema);
    }
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
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
  TInputSchema extends TSchema | undefined = undefined,
  // `const` so an inline array literal (`outputsSchema: [A, B]`) infers as a
  // tuple rather than a widened `TSchema[]`, giving precise positional output
  // typing without the author needing `as const`.
  const TOutputsSchema extends
    | TSchema
    | readonly TSchema[]
    | Record<string, TSchema>
    | undefined = undefined,
>(
  def: IONodeDefinition<
    TConfigSchema,
    TCredsSchema,
    TSettingsSchema,
    TInputSchema,
    TOutputsSchema
  >,
): NodeConstructor<
  IIONode<
    InferOr<TConfigSchema, any>,
    InferOr<TCredsSchema, any>,
    InferOr<TInputSchema, any>,
    InferOutputs<TOutputsSchema>
  >
> {
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
    static override readonly align = def.align;

    static override readonly configSchema: Schema | undefined =
      def.configSchema as Schema | undefined;
    static override readonly credentialsSchema: Schema | undefined =
      def.credentialsSchema as Schema | undefined;
    static override readonly settingsSchema: Schema | undefined =
      def.settingsSchema as Schema | undefined;
    static override readonly inputSchema: Schema | undefined =
      def.inputSchema as Schema | undefined;
    static override readonly outputsSchema:
      | Schema
      | Schema[]
      | Record<string, Schema>
      | undefined = def.outputsSchema as
      | Schema
      | Schema[]
      | Record<string, Schema>
      | undefined;
    static override readonly validateInput: boolean =
      def.validateInput ?? false;
    static override readonly validateOutput: boolean | boolean[] =
      def.validateOutput ?? false;

    static override registered(RED: RED) {
      return def.registered?.(RED);
    }

    override async input(msg: InferOr<TInputSchema, any>) {
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

  normalizeSchemas(
    [
      NodeClass.configSchema,
      NodeClass.credentialsSchema,
      NodeClass.settingsSchema,
      NodeClass.inputSchema,
    ],
    NodeClass.outputsSchema,
  );

  return NodeClass as unknown as NodeConstructor<
    IIONode<
      InferOr<TConfigSchema, any>,
      InferOr<TCredsSchema, any>,
      InferOr<TInputSchema, any>,
      InferOutputs<TOutputsSchema>
    >
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
function defineConfigNode<
  TConfigSchema extends TSchema | undefined = undefined,
  TCredsSchema extends TSchema | undefined = undefined,
  TSettingsSchema extends TSchema | undefined = undefined,
>(
  def: ConfigNodeDefinition<TConfigSchema, TCredsSchema, TSettingsSchema>,
): NodeConstructor<
  IConfigNode<InferOr<TConfigSchema, any>, InferOr<TCredsSchema, any>>
> {
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
    IConfigNode<InferOr<TConfigSchema, any>, InferOr<TCredsSchema, any>>
  >;
}

export { defineIONode, defineConfigNode };
