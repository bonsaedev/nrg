import type { TSchema } from "@sinclair/typebox";
import type { Schema } from "../schemas/types";
import type { RED, NodeRedNode } from "../../server/types";
import { Node } from "./node";
import { NrgError } from "../../errors";
import type { BUILTIN_PORT_KEYS } from "../../constants";
import type {
  HexColor,
  IIONode,
  IONodeContext,
  IONodeContextScope,
  IONodeStatus,
  IONodeConfig,
  IONodeCredentials,
} from "./types";
import { isSchemaLike, setupContext } from "./utils";
import { WIRE_HANDLERS } from "./symbols";

type BuiltinPortFlags = {
  [K in (typeof BUILTIN_PORT_KEYS)[number]]?: boolean;
};

type ReturnPropertyConfig = {
  returnProperty?: string;
};

const RETURN_PROPERTY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Key holding the append-only lineage of prior input messages. Visible in
 * the debug panel by design — it is the node's provenance chain. */
const INPUT_KEY = "input";

/**
 * Controls how an outgoing message carries the incoming message's context:
 * - `"nest"` (default): keep all incoming keys and push the full input under
 *   `input`, so the prior message — including any value the result overwrites
 *   — is always recoverable (`msg.input.output`). The `input` chain
 *   accumulates one frame per node, forming a provenance trail visible in the
 *   debug panel.
 * - `"carry"`: keep all incoming keys (including any upstream `input`) but do
 *   not record this node — context flows through without growing.
 * - `"reset"`: drop all inherited context; the outgoing message is only the
 *   result at the return key.
 */
export type ContextMode = "nest" | "carry" | "reset";

/**
 * Base class for nodes that process messages. Provides input/output handling,
 * schema validation, status updates, and emit port management.
 *
 * Every node has a return key (`"output"` by default): the value passed to
 * `send()` is merged into the incoming message at that key and the full prior
 * message is kept under `input` (`{ ...msg, [returnKey]: result, input: msg }`),
 * so upstream properties propagate and the provenance chain is recoverable.
 * Declaring `returnProperty` in the `configSchema` only lets the flow author
 * override the key in the editor — it does not change that a return key always
 * exists. `this.send(x)` always means "x is the result", never "x is the whole
 * message".
 *
 * @example
 * ```ts
 * export default class MyNode extends IONode<Config, any, Input, Output> {
 *   static readonly type = "my-node";
 *   static readonly category = "function";
 *   static readonly color = "#ffffff" as const;
 *
 *   async input(msg: Input) {
 *     // sends { ...msg, output: <result>, input: msg }
 *     this.send(msg.output.toUpperCase());
 *   }
 * }
 * ```
 */
abstract class IONode<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
>
  extends Node<TConfig, TCredentials, TSettings>
  implements IIONode<TConfig, TCredentials, TInput, TOutput, TSettings>
{
  public static readonly align?: "left" | "right";
  public static readonly color: HexColor;
  public static readonly inputSchema?: Schema;
  // outputsSchema accepts any schema shape: with returnProperty the raw sent
  // value is validated, and results are frequently non-objects.
  public static readonly outputsSchema?:
    | TSchema
    | TSchema[]
    | Record<string, TSchema>;
  public static readonly validateInput: boolean = false;
  public static readonly validateOutput: boolean = false;

  public static get inputs(): 0 | 1 {
    return this.inputSchema ? 1 : 0;
  }

  public static get outputs(): number {
    const s = this.outputsSchema;
    if (!s) return 0;
    if (Array.isArray(s)) return s.length;
    if (isSchemaLike(s)) return 1;
    // Record of named ports — validate keys
    const keys = Object.keys(s);
    for (const key of keys) {
      if (/^\d+$/.test(key)) {
        throw new NrgError(
          `outputsSchema record key "${key}" in ${this.type} looks numeric. ` +
            `Use descriptive string names (e.g. "success", "failure") to avoid ` +
            `JavaScript object key ordering issues.`,
        );
      }
      if (key === "error" || key === "complete" || key === "status") {
        throw new NrgError(
          `outputsSchema record key "${key}" in ${this.type} is reserved for built-in ports. ` +
            `Use a different name (e.g. "failed" instead of "error").`,
        );
      }
    }
    return keys.length;
  }

  #send: ((msg: any) => void) | undefined;
  /**
   * Most recent input message — the spread base for returnProperty wrapping. Not
   * cleared after input() so late async sends merge with the last received
   * message.
   */
  #currentInputMsg: unknown;

  declare public readonly config: IONodeConfig<TConfig>;
  protected override readonly context: IONodeContext;

  constructor(
    RED: RED,
    node: NodeRedNode,
    config: IONodeConfig<TConfig>,
    credentials: IONodeCredentials<TCredentials>,
  ) {
    super(RED, node, config, credentials);

    const context = node.context();
    const fn = (scope: IONodeContextScope, store?: string) => {
      const target =
        scope === "global"
          ? context.global
          : scope === "flow"
            ? context.flow
            : context;
      return setupContext(target, store);
    };

    fn.node = setupContext(context);
    fn.flow = setupContext(context.flow);
    fn.global = setupContext(context.global);

    this.context = fn as any;

    const returnPropertyKey = this.#returnPropertyKey();
    if (!RETURN_PROPERTY_PATTERN.test(returnPropertyKey)) {
      throw new NrgError(
        `Invalid returnProperty key "${returnPropertyKey}" in ${(this.constructor as typeof IONode).type} — ` +
          `it must be a valid JavaScript identifier (letters, digits, _, $; not starting with a digit)`,
      );
    }
  }

  override [WIRE_HANDLERS](
    nodeRedNode: NodeRedNode,
    createdPromise: Promise<void>,
  ) {
    super[WIRE_HANDLERS](nodeRedNode, createdPromise);

    const NC = this.constructor as typeof IONode;

    nodeRedNode.on(
      "input",
      async (
        msg: unknown,
        send: (msg: unknown) => void,
        done: (err?: Error) => void,
      ) => {
        try {
          await createdPromise;
        } catch {
          done(new Error("Node failed to initialize"));
          return;
        }

        try {
          nodeRedNode.log("Calling input");
          this.#currentInputMsg = msg;
          await Promise.resolve(this.#input(msg as TInput, send));

          // Send to complete port if enabled. Nest the input so a flow
          // resumed off the complete port (e.g. an iterator continuing after
          // all elements) carries the same `input` lineage as a normal send.
          this.#sendToPort("complete", {
            ...(msg as Record<string, unknown>),
            complete: {
              source: this.#nodeSource(),
            },
            [INPUT_KEY]: msg,
          });

          done();
          nodeRedNode.log("Input processed");
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Unknown error during input handling";

          // Send to error port if enabled — carry the input lineage too, so
          // error branches continue the flow with the same context.
          this.#sendToPort("error", {
            ...(msg as Record<string, unknown>),
            error: {
              message: errorMsg,
              source: this.#nodeSource(),
            },
            [INPUT_KEY]: msg,
          });

          if (error instanceof Error) {
            nodeRedNode.error(
              "Error while processing input: " + error.message,
              msg,
            );
            done(error);
          } else {
            nodeRedNode.error(
              "Unknown error occurred during input handling",
              msg,
            );
            done(new Error(errorMsg));
          }
        }
      },
    );
  }

  public input(msg: TInput): void | Promise<void> {}

  async #input(msg: TInput, send: (msg: any) => void) {
    const NodeClass = this.constructor as typeof IONode;
    const shouldValidateInput =
      this.config.validateInput ?? NodeClass.validateInput;
    if (shouldValidateInput && NodeClass.inputSchema) {
      this.log("Validating input");
      this.RED.validator.validate(msg, NodeClass.inputSchema, {
        cacheKey: NodeClass.inputSchema.$id || `${NodeClass.type}:input-schema`,
        throwOnError: true,
      });
      this.log("Input is valid");
    }
    this.#send = send;
    try {
      await Promise.resolve(this.input(msg));
    } finally {
      this.#send = undefined;
    }
  }

  public send(msg: TOutput, contextMode: ContextMode = "nest") {
    const NodeClass = this.constructor as typeof IONode;
    // With returnProperty declared on a single-output node, the argument is
    // always THE value — arrays included. Node-RED's array-as-ports
    // convention only applies to multi-output nodes, where each slot is a
    // separate value to wrap.
    // Every node has a return key, so a single-output node always treats the
    // argument as the value (arrays included). Multi-output nodes still use
    // Node-RED's array-as-ports convention.
    const sendsValue = this.baseOutputs <= 1;
    const shouldValidateOutput =
      this.config.validateOutput ?? NodeClass.validateOutput;
    if (shouldValidateOutput && NodeClass.outputsSchema) {
      this.log("Validating output");
      const rawSchema = NodeClass.outputsSchema;

      if (Array.isArray(rawSchema)) {
        // Per-port validation: schemas[i] validates msg[i]
        const msgs = msg as unknown[];
        for (let i = 0; i < rawSchema.length; i++) {
          if (msgs[i] == null) continue;
          this.RED.validator.validate(msgs[i], rawSchema[i], {
            cacheKey:
              rawSchema[i].$id || `${NodeClass.type}:output-schema:${i}`,
            throwOnError: true,
          });
        }
      } else if (isSchemaLike(rawSchema)) {
        // Single schema
        if (Array.isArray(msg) && !sendsValue) {
          const msgs = msg as unknown[];
          for (let i = 0; i < msgs.length; i++) {
            if (msgs[i] == null) continue;
            this.RED.validator.validate(msgs[i], rawSchema as Schema, {
              cacheKey:
                (rawSchema as Schema).$id || `${NodeClass.type}:output-schema`,
              throwOnError: true,
            });
          }
        } else {
          this.RED.validator.validate(msg, rawSchema as Schema, {
            cacheKey:
              (rawSchema as Schema).$id || `${NodeClass.type}:output-schema`,
            throwOnError: true,
          });
        }
      } else {
        // Record of named port schemas — validate per-port by index
        const schemaArray = Object.values(rawSchema);
        const msgs = msg as unknown[];
        for (let i = 0; i < schemaArray.length; i++) {
          if (msgs[i] == null) continue;
          this.RED.validator.validate(msgs[i], schemaArray[i], {
            cacheKey:
              schemaArray[i].$id || `${NodeClass.type}:output-schema:${i}`,
            throwOnError: true,
          });
        }
      }
      this.log("Output is valid");
    }

    const truncated =
      Array.isArray(msg) && !sendsValue
        ? (msg as unknown[]).slice(0, this.baseOutputs)
        : msg;
    const out =
      Array.isArray(truncated) && !sendsValue
        ? truncated.map((m) =>
            m == null ? m : this.#wrapOutgoing(m, contextMode),
          )
        : truncated == null
          ? truncated
          : this.#wrapOutgoing(truncated, contextMode);
    if (this.#send) {
      this.#send(out);
    } else {
      this.node.send(out);
    }
  }

  /**
   * Resolves the active return key. `null` = the node did not declare
   * `returnProperty` in its configSchema, so its code owns the outgoing message
   * shape (no wrapping).
   */
  /**
   * Every node has a return property — `"output"` by default. Declaring
   * `SchemaType.ReturnProperty()` in the configSchema doesn't create it; it
   * only exposes the key to the flow author so they can override it in the
   * editor (and lets the node pick a different default). So `this.send(x)`
   * always means "x is the value at the return key", never "x is the whole
   * outgoing message".
   */
  #returnPropertyKey(): string {
    const NodeClass = this.constructor as typeof IONode;
    const declared = (
      NodeClass.configSchema as
        | { properties?: Record<string, { default?: unknown }> }
        | undefined
    )?.properties?.returnProperty;

    // flow-author override (only possible when the prop is declared + editable)
    const configured = (this.config as unknown as ReturnPropertyConfig)
      .returnProperty;
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
    // node-defined default via ReturnProperty({ default: "data" }), else output
    if (declared && typeof declared.default === "string" && declared.default) {
      return declared.default;
    }
    return "output";
  }

  /**
   * Merges a sent value into the incoming message at the returnProperty key so
   * upstream message properties propagate. A fresh base is built per call so
   * multi-port sends never share an object.
   */
  #wrapOutgoing(value: unknown, mode: ContextMode = "nest"): unknown {
    const key = this.#returnPropertyKey();
    const input = (this.#currentInputMsg as Record<string, unknown>) ?? {};
    if (mode === "reset") {
      return { [key]: value };
    }
    if (mode === "carry") {
      return { ...input, [key]: value };
    }
    // "nest" — preserve the full input under `input` so nothing the result
    // overwrites is ever lost. Spread is shallow (clone-free, any-object-safe);
    // Node-RED's runtime clones messages 2..N on fan-out, so per-branch
    // isolation is handled at delivery.
    return { ...input, [key]: value, [INPUT_KEY]: input };
  }

  // --- Built-in port management ---

  public get baseOutputs(): number {
    return (this.constructor as typeof IONode).outputs ?? 0;
  }

  public get totalOutputs(): number {
    const config = this.config as unknown as BuiltinPortFlags;
    let count = this.baseOutputs;
    if (config.errorPort) count++;
    if (config.completePort) count++;
    if (config.statusPort) count++;
    return count;
  }

  /**
   * Send a message to a specific output port by index or name.
   * Custom named ports are resolved from `outputsSchema` when it is a record.
   * Numeric indices refer to the base output ports (0-based).
   *
   * Built-in ports (`"error"`, `"complete"`, `"status"`) are managed by the
   * framework and cannot be sent to directly. Use `this.status()` for status,
   * throw an error or call `this.error()` for the error port, and the complete
   * port is sent automatically on successful input processing.
   */
  public sendToPort<
    P extends
      | (TOutput extends Record<string, Record<string, any>>
          ? keyof TOutput & string
          : never)
      | number,
  >(
    port: P,
    msg: P extends keyof TOutput ? TOutput[P] : unknown,
    contextMode: ContextMode = "nest",
  ) {
    if (port === "error" || port === "complete" || port === "status") {
      throw new NrgError(
        `sendToPort("${port}") is not allowed. Built-in ports are managed by the framework.`,
      );
    }
    this.#sendToPort(
      port,
      msg == null ? msg : this.#wrapOutgoing(msg, contextMode),
    );
  }

  #sendToPort(port: number | string, msg: unknown) {
    let portIndex: number | null;
    if (typeof port === "number") {
      portIndex = port;
    } else if (port === "error" || port === "complete" || port === "status") {
      portIndex = this.#getBuiltinPortIndex(port);
      if (portIndex === null) return;
    } else {
      portIndex = this.#getNamedPortIndex(port);
      if (portIndex === null) return;
    }
    const out = new Array(this.totalOutputs);
    out[portIndex] = msg;
    this.node.send(out);
  }

  #getNamedPortIndex(name: string): number | null {
    const schema = (this.constructor as typeof IONode).outputsSchema;
    if (!schema || Array.isArray(schema) || isSchemaLike(schema)) return null;
    const idx = Object.keys(schema).indexOf(name);
    return idx === -1 ? null : idx;
  }

  #getBuiltinPortIndex(name: "error" | "complete" | "status"): number | null {
    const config = this.config as unknown as BuiltinPortFlags;
    if (name === "error") {
      return config.errorPort ? this.baseOutputs : null;
    }
    let idx = this.baseOutputs;
    if (config.errorPort) idx++;
    if (name === "complete") {
      return config.completePort ? idx : null;
    }
    if (config.completePort) idx++;
    return config.statusPort ? idx : null;
  }

  #nodeSource() {
    return {
      id: this.id,
      type: (this.constructor as typeof IONode).type,
      name: this.name,
    };
  }

  public status(status: IONodeStatus) {
    this.node.status(status);
    this.#sendToPort("status", {
      status,
      source: this.#nodeSource(),
    });
  }

  public override error(message: string, msg?: any) {
    super.error(message, msg);
    if (msg) {
      this.#sendToPort("error", {
        ...msg,
        error: {
          message,
          source: this.#nodeSource(),
        },
        [INPUT_KEY]: msg,
      });
    }
  }

  public updateWires(wires: string[][]) {
    this.node.updateWires(wires);
  }

  public receive(msg: TInput) {
    this.node.receive(msg);
  }

  public get x(): number {
    return this.node.x;
  }

  public get y(): number {
    return this.node.y;
  }

  public get g(): string | undefined {
    return this.node.g;
  }

  public get wires(): string[][] {
    return this.node.wires;
  }

  public override get credentials():
    | IONodeCredentials<TCredentials>
    | undefined {
    return this.node.credentials;
  }
}

export { IONode };
