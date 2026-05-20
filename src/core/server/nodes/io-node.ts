import type { Schema } from "../schemas/types";
import type { RED, NodeRedNode } from "../../server/types";
import { Node } from "./node";
import type {
  HexColor,
  IIONode,
  IONodeContext,
  IONodeContextScope,
  IONodeStatus,
  IONodeConfig,
  IONodeCredentials,
} from "./types";
import { setupContext } from "./utils";
import { WIRE_HANDLERS } from "./symbols";

/** Reserved config property names for dynamic emit ports */
const EMIT_PORT_KEYS = ["emitError", "emitComplete", "emitStatus"] as const;

interface EmitPortFlags {
  emitError?: boolean;
  emitComplete?: boolean;
  emitStatus?: boolean;
}

/**
 * Base class for nodes that process messages. Provides input/output handling,
 * schema validation, status updates, and emit port management.
 *
 * @example
 * ```ts
 * export default class MyNode extends IONode<Config, any, Input, Output> {
 *   static readonly type = "my-node";
 *   static readonly category = "function";
 *   static readonly color = "#ffffff" as const;
 *
 *   async input(msg: Input) {
 *     this.send({ payload: msg.payload.toUpperCase() });
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
  public static readonly outputsSchema?: Schema | Schema[];
  public static readonly validateInput: boolean = false;
  public static readonly validateOutput: boolean = false;

  public static get inputs(): 0 | 1 {
    return this.inputSchema ? 1 : 0;
  }

  public static get outputs(): number {
    const s = this.outputsSchema;
    if (!s) return 0;
    return Array.isArray(s) ? s.length : 1;
  }

  #send: ((msg: any) => void) | undefined;

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
          await Promise.resolve(this.#input(msg as TInput, send));

          // Send to complete port if enabled
          this.#sendToPort("complete", {
            ...(msg as Record<string, unknown>),
            complete: {
              source: this.#nodeSource(),
            },
          });

          done();
          nodeRedNode.log("Input processed");
        } catch (error) {
          const errorMsg =
            error instanceof Error
              ? error.message
              : "Unknown error during input handling";

          // Send to error port if enabled
          this.#sendToPort("error", {
            ...(msg as Record<string, unknown>),
            error: {
              message: errorMsg,
              source: this.#nodeSource(),
            },
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

  public send(msg: TOutput) {
    const NodeClass = this.constructor as typeof IONode;
    const shouldValidateOutput =
      this.config.validateOutput ?? NodeClass.validateOutput;
    if (shouldValidateOutput && NodeClass.outputsSchema) {
      this.log("Validating output");
      const schemas = NodeClass.outputsSchema;

      if (Array.isArray(schemas)) {
        // Per-port validation: schemas[i] validates msg[i]
        const msgs = msg as unknown[];
        for (let i = 0; i < schemas.length; i++) {
          if (msgs[i] == null) continue;
          this.RED.validator.validate(msgs[i], schemas[i], {
            cacheKey: schemas[i].$id || `${NodeClass.type}:output-schema:${i}`,
            throwOnError: true,
          });
        }
      } else if (Array.isArray(msg)) {
        // Single schema, array of messages: validate each non-null element
        const msgs = msg as unknown[];
        for (let i = 0; i < msgs.length; i++) {
          if (msgs[i] == null) continue;
          this.RED.validator.validate(msgs[i], schemas, {
            cacheKey: schemas.$id || `${NodeClass.type}:output-schema`,
            throwOnError: true,
          });
        }
      } else {
        // Single schema, single message
        this.RED.validator.validate(msg, schemas, {
          cacheKey: schemas.$id || `${NodeClass.type}:output-schema`,
          throwOnError: true,
        });
      }
      this.log("Output is valid");
    }

    if (this.#send) {
      this.#send(msg);
    } else {
      this.node.send(msg);
    }
  }

  // --- Emit port management ---

  public get baseOutputs(): number {
    return (this.constructor as typeof IONode).outputs ?? 0;
  }

  public get totalOutputs(): number {
    const config = this.config as unknown as EmitPortFlags;
    let count = this.baseOutputs;
    if (config.emitError) count++;
    if (config.emitComplete) count++;
    if (config.emitStatus) count++;
    return count;
  }

  /**
   * Send a message to a specific output port by index or name.
   * Named ports: `"error"`, `"complete"`, `"status"` — resolved automatically
   * based on the node's emit port configuration.
   * Numeric indices refer to the base output ports (0-based).
   */
  public sendToPort(
    port: number | "error" | "complete" | "status",
    msg: TOutput,
  ) {
    this.#sendToPort(port, msg);
  }

  #sendToPort(port: number | "error" | "complete" | "status", msg: unknown) {
    let portIndex: number | null;
    if (typeof port === "number") {
      portIndex = port;
    } else {
      portIndex = this.#getEmitPortIndex(port);
      if (portIndex === null) return;
    }
    const out: (unknown | null)[] = Array(this.totalOutputs).fill(null);
    out[portIndex] = msg;
    this.node.send(out);
  }

  #getEmitPortIndex(name: "error" | "complete" | "status"): number | null {
    const config = this.config as unknown as EmitPortFlags;
    if (name === "error") {
      return config.emitError ? this.baseOutputs : null;
    }
    let idx = this.baseOutputs;
    if (config.emitError) idx++;
    if (name === "complete") {
      return config.emitComplete ? idx : null;
    }
    if (config.emitComplete) idx++;
    return config.emitStatus ? idx : null;
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

export { IONode, EMIT_PORT_KEYS };
