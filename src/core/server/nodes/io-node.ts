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
  public static readonly outputsSchema?:
    | Schema
    | Schema[]
    | Record<string, Schema>;
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
    // Record of named ports — validate no numeric keys
    const keys = Object.keys(s);
    for (const key of keys) {
      if (/^\d+$/.test(key)) {
        throw new NrgError(
          `outputsSchema record key "${key}" in ${this.type} looks numeric. ` +
            `Use descriptive string names (e.g. "success", "failure") to avoid ` +
            `JavaScript object key ordering issues.`,
        );
      }
    }
    return keys.length;
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
        if (Array.isArray(msg)) {
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

    if (this.#send) {
      this.#send(msg);
    } else {
      this.node.send(msg);
    }
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
   * Built-in ports: `"error"`, `"complete"`, `"status"` — resolved automatically
   * based on the node's built-in port configuration.
   * Custom named ports are resolved from `outputsSchema` when it is a record.
   * Numeric indices refer to the base output ports (0-based).
   */
  public sendToPort<
    P extends
      | (keyof TOutput & string)
      | number
      | "error"
      | "complete"
      | "status",
  >(port: P, msg: P extends keyof TOutput ? TOutput[P] : unknown) {
    this.#sendToPort(port, msg);
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
    const out: (unknown | null)[] = Array(this.totalOutputs).fill(null);
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
