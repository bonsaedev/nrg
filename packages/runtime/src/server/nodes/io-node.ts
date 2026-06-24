import { Kind, type TSchema } from "@sinclair/typebox";
import type { Schema } from "../schemas/types";
import type { RED, NodeRedNode } from "../../server/types";
import { Node } from "./node";
import { NrgError } from "../../errors";
import type {
  HexColor,
  IIONode,
  IONodeContext,
  IONodeContextScope,
  IONodeStatus,
  IONodeConfig,
  IONodeCredentials,
} from "./types";
import { setupContext } from "./context";
import { WIRE_HANDLERS } from "./symbols";

/**
 * Type guard for an `outputsSchema` shape — a single schema, an array of
 * schemas, a record of named schemas, or `undefined`. Narrows to a single
 * {@link TSchema} (true only when `obj` carries the TypeBox `Kind` symbol, i.e.
 * it is one schema rather than an array/record). `TSchema` (not `Schema`/
 * `TObject`) because a single output port may be a non-object schema.
 */
function isSchemaLike(
  obj: TSchema | TSchema[] | Record<string, TSchema> | undefined,
): obj is TSchema {
  return obj != null && typeof obj === "object" && Kind in obj;
}

const RETURN_PROPERTY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Key holding the append-only lineage of prior input messages. Visible in
 * the debug panel by design — it is the node's provenance chain. */
const INPUT_KEY = "input";

/**
 * Controls how an outgoing message carries the incoming message's context:
 * - `"carry"` (default): keep all incoming keys — including any upstream
 *   `input` — but do not record this node, so context flows through without the
 *   provenance chain growing. The safe default for loops and long chains.
 * - `"trace"`: keep all incoming keys and also push the full input under
 *   `input`, so the prior message — including any value the result overwrites —
 *   stays recoverable (`msg.input.output`). The chain accumulates one frame per
 *   node, a provenance trail visible in the debug panel; opt in for linear
 *   flows that want full lineage.
 * - `"reset"`: drop all inherited context; the outgoing message is only the
 *   result at the return key.
 */
export type ContextMode = "carry" | "trace" | "reset";

/**
 * Base class for nodes that process messages. Provides input/output handling,
 * schema validation, status updates, and emit port management.
 *
 * Every node has a return key (`"output"` by default): the value passed to
 * `send()` is merged into the incoming message at that key
 * (`{ ...msg, [returnKey]: result }`), so upstream properties propagate. By
 * default the context is carried without growing; declaring
 * `outputContextModes` in the `configSchema` lets the flow author pick `trace`
 * (keep the full prior message under `input` as a recoverable provenance chain)
 * or `reset` per port. The return key, output validation, and context mode all
 * resolve per output port; declaring `outputReturnProperties` in the
 * `configSchema` sets per-port default keys and lets the flow author pick a key
 * other than `output` per port — it does not change that a return key always
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
 *     // sends { ...msg, output: <result> }
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
  // outputsSchema accepts any schema shape: the raw sent value (per port) is
  // validated, and results are frequently non-objects.
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

  /**
   * The names of the base output ports when `outputsSchema` is a record of
   * named ports (`{ success, failure }`), in declaration order — otherwise
   * `undefined` (a single schema or a positional array). Resolved here, where
   * TypeBox's `Kind` symbol is intact, so the editor reads the names directly
   * instead of guessing them from a serialized (symbol-stripped) schema.
   */
  public static get outputPortNames(): string[] | undefined {
    const s = this.outputsSchema;
    if (!s || Array.isArray(s) || isSchemaLike(s)) return undefined;
    return Object.keys(s);
  }

  #send: ((msg: any) => void) | undefined;
  /**
   * Most recent input message — the spread base for output wrapping. Not
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
    const resolve = (scope: IONodeContextScope, store?: string) => {
      const target =
        scope === "global"
          ? context.global
          : scope === "flow"
            ? context.flow
            : context;
      return setupContext(target, store);
    };

    this.context = Object.assign(resolve, {
      node: setupContext(context),
      flow: setupContext(context.flow),
      global: setupContext(context.global),
    });

    // Validate any per-port return keys up front.
    const outputReturnProperties = this.config.outputReturnProperties;
    if (outputReturnProperties) {
      for (const [port, key] of Object.entries(outputReturnProperties)) {
        if (
          typeof key === "string" &&
          key.trim() &&
          !RETURN_PROPERTY_PATTERN.test(key.trim())
        ) {
          throw new NrgError(
            `Invalid return property "${key}" for output port ${port} in ${(this.constructor as typeof IONode).type} — ` +
              `it must be a valid JavaScript identifier (letters, digits, _, $; not starting with a digit)`,
          );
        }
      }
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
          const result = await this.#input(msg as TInput, send);

          // Send to complete port if enabled. Nest the input so a flow
          // resumed off the complete port (e.g. an iterator continuing after
          // all elements) carries the same `input` lineage as a normal send.
          // When input() returns a value (e.g. an async node that awaits work
          // and yields its result), it rides the complete port under `output`,
          // so the flow continues with it — `void`/no return keeps today's shape.
          this.#sendToPort("complete", {
            ...(msg as Record<string, unknown>),
            ...(result !== undefined ? { output: result } : {}),
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
          // error branches continue the flow with the same context. A thrown
          // error's own enumerable properties are spread first, so authors can
          // throw a custom `Error` subclass carrying extra data (e.g.
          // `class MyError extends Error { constructor(m){ super(m); this.code = …; } }`).
          // `name`/`message`/`source` are layered last so they stay
          // authoritative and Catch-node compatible. Only enumerable own props
          // ride along: `message`/`stack` are non-enumerable, so set extra data
          // as instance properties and keep it serializable.
          const errorData =
            error && typeof error === "object"
              ? { ...(error as Record<string, unknown>) }
              : {};
          this.#sendToPort("error", {
            ...(msg as Record<string, unknown>),
            error: {
              ...errorData,
              name: (error as { name?: string })?.name ?? "Error",
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

  public input(msg: TInput): unknown {
    return undefined;
  }

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
      return await Promise.resolve(this.input(msg));
    } finally {
      this.#send = undefined;
    }
  }

  public send(msg: TOutput) {
    // Every emission is delivered as a Node-RED positional array — one slot per
    // base output port — so the captured shape is uniform regardless of arity.
    // Since `node.send([m]) === node.send(m)` for port 0, flow behaviour is
    // unchanged; only the recorded/asserted shape becomes consistent.
    //
    // A multi-output node uses Node-RED's array-as-ports convention (one value
    // per port). A single-output node always treats the argument as the value
    // (arrays included) — hence the `baseOutputs > 1` guard, which keeps a
    // single-output `send([a, b])` meaning "the value at port 0 is [a, b]".
    const multi = this.baseOutputs > 1 && Array.isArray(msg);
    const values = multi
      ? (msg as unknown[]).slice(0, this.baseOutputs)
      : [msg];

    const out = values.map((m, port) => {
      if (m == null) return m; // preserve sparse/null slots
      this.#validatePort(m, port);
      return this.#wrapOutgoing(m, this.#resolveContextMode(port), port);
    });

    this.#deliver(out);
  }

  #deliver(out: unknown) {
    if (this.#send) {
      this.#send(out);
    } else {
      this.node.send(out);
    }
  }

  /**
   * Per-port output validation. A port validates when its flow-author flag
   * (`config.validateOutputs[port]`) — or the node's static `validateOutput`
   * fallback — is on and a schema exists for that port.
   */
  #validatePort(value: unknown, port: number) {
    const NodeClass = this.constructor as typeof IONode;
    const configured = this.config.validateOutputs?.[port];
    if (!(configured ?? NodeClass.validateOutput)) return;

    const schema = this.#outputSchemaForPort(port);
    if (!schema) return;
    this.log("Validating output");
    this.RED.validator.validate(value, schema, {
      cacheKey: schema.$id || `${NodeClass.type}:output-schema:${port}`,
      throwOnError: true,
    });
    this.log("Output is valid");
  }

  /** Resolves the output schema for a base-output port: array → `[port]`,
   * record → the port-th value, single schema → itself. */
  #outputSchemaForPort(port: number): Schema | undefined {
    const raw = (this.constructor as typeof IONode).outputsSchema;
    if (!raw) return undefined;
    if (Array.isArray(raw)) return raw[port] as Schema | undefined;
    if (isSchemaLike(raw)) return raw as Schema;
    return Object.values(raw)[port] as Schema | undefined;
  }

  /**
   * The return key for an output port — `"output"` unless a custom one is set
   * via `outputReturnProperties[port]` (author default and/or flow-author
   * override, only possible when the node declares `outputReturnProperties`).
   * `this.send(x)` always means "x is the value at this port's return key",
   * never "x is the whole outgoing message".
   */
  #returnPropertyKey(port: number): string {
    const configured = this.config.outputReturnProperties?.[port];
    if (typeof configured === "string" && configured.trim()) {
      return configured.trim();
    }
    return "output";
  }

  /**
   * Resolves the context mode for a base-output port from the flow author's
   * per-port config (`config.outputContextModes[port]`, written by the editor
   * when the node declares `outputContextModes`), falling back to `"carry"`.
   */
  #resolveContextMode(port: number): ContextMode {
    return this.config.outputContextModes?.[port] ?? "carry";
  }

  /**
   * Merges a sent value into the incoming message at the returnProperty key so
   * upstream message properties propagate. A fresh base is built per call so
   * multi-port sends never share an object.
   */
  #wrapOutgoing(value: unknown, mode: ContextMode, port: number): unknown {
    const key = this.#returnPropertyKey(port);
    const input = (this.#currentInputMsg as Record<string, unknown>) ?? {};
    if (mode === "reset") {
      return { [key]: value };
    }
    if (mode === "trace") {
      // preserve the full input under `input` so nothing the result overwrites
      // is ever lost. Spread is shallow (clone-free, any-object-safe);
      // Node-RED's runtime clones messages 2..N on fan-out, so per-branch
      // isolation is handled at delivery.
      return { ...input, [key]: value, [INPUT_KEY]: input };
    }
    // "carry" (default) — keep all incoming keys (including any upstream
    // `input`) but don't record this node, so context flows through without the
    // provenance chain growing.
    return { ...input, [key]: value };
  }

  // --- Built-in port management ---

  public get baseOutputs(): number {
    return (this.constructor as typeof IONode).outputs ?? 0;
  }

  public get totalOutputs(): number {
    let count = this.baseOutputs;
    if (this.config.errorPort) count++;
    if (this.config.completePort) count++;
    if (this.config.statusPort) count++;
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
  >(port: P, msg: P extends keyof TOutput ? TOutput[P] : unknown) {
    if (port === "error" || port === "complete" || port === "status") {
      throw new NrgError(
        `sendToPort("${port}") is not allowed. Built-in ports are managed by the framework.`,
      );
    }
    const portIndex =
      typeof port === "number" ? port : this.#getNamedPortIndex(port);
    const mode = this.#resolveContextMode(portIndex ?? 0);
    this.#sendToPort(
      port,
      msg == null ? msg : this.#wrapOutgoing(msg, mode, portIndex ?? 0),
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
    if (name === "error") {
      return this.config.errorPort ? this.baseOutputs : null;
    }
    let idx = this.baseOutputs;
    if (this.config.errorPort) idx++;
    if (name === "complete") {
      return this.config.completePort ? idx : null;
    }
    if (this.config.completePort) idx++;
    return this.config.statusPort ? idx : null;
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
