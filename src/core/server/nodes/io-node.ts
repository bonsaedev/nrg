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

/** Reserved config property names for dynamic emit ports */
const EMIT_PORT_KEYS = ["emitError", "emitComplete", "emitStatus"] as const;

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

  private _send: ((msg: any) => void) | undefined;

  declare public readonly config: IONodeConfig<TConfig>;
  protected override readonly context: IONodeContext;

  // NOTE: used by the registered function. Had to be a different one to avoid calling the parent's input again
  /** @internal */
  public static override _registered(RED: RED): void | Promise<void> {
    this.validateSettings(RED);
    return this.registered?.(RED);
  }

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

  public input(msg: TInput): void | Promise<void> {}

  // NOTE: used by the registered function. Had to be a different one to avoid calling the parent's input again
  /** @internal */
  public async _input(msg: TInput, send: (msg: any) => void) {
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
    this._send = send;
    try {
      await Promise.resolve(this.input(msg));
    } finally {
      this._send = undefined;
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
        const msgs = msg as any[];
        for (let i = 0; i < schemas.length; i++) {
          if (msgs[i] == null) continue;
          this.RED.validator.validate(msgs[i], schemas[i], {
            cacheKey: schemas[i].$id || `${NodeClass.type}:output-schema:${i}`,
            throwOnError: true,
          });
        }
      } else if (Array.isArray(msg)) {
        // Single schema, array of messages: validate each non-null element
        for (let i = 0; i < (msg as any[]).length; i++) {
          if ((msg as any[])[i] == null) continue;
          this.RED.validator.validate((msg as any[])[i], schemas, {
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

    if (this._send) {
      this._send(msg);
    } else {
      this.node.send(msg);
    }
  }

  // --- Emit port management ---

  /** @internal */
  public get _baseOutputs(): number {
    return (this.constructor as typeof IONode).outputs ?? 0;
  }

  /** @internal */
  public get _totalOutputs(): number {
    let count = this._baseOutputs;
    if ((this.config as any).emitError) count++;
    if ((this.config as any).emitComplete) count++;
    if ((this.config as any).emitStatus) count++;
    return count;
  }

  /** @internal */
  public _sendToPort(portIndex: number, msg: any) {
    const out: (any | null)[] = Array(this._totalOutputs).fill(null);
    out[portIndex] = msg;
    this.node.send(out);
  }

  /** @internal */
  public _getErrorPortIndex(): number | null {
    if (!(this.config as any).emitError) return null;
    return this._baseOutputs;
  }

  /** @internal */
  public _getCompletePortIndex(): number | null {
    if (!(this.config as any).emitComplete) return null;
    let idx = this._baseOutputs;
    if ((this.config as any).emitError) idx++;
    return idx;
  }

  /** @internal */
  public _getStatusPortIndex(): number | null {
    if (!(this.config as any).emitStatus) return null;
    let idx = this._baseOutputs;
    if ((this.config as any).emitError) idx++;
    if ((this.config as any).emitComplete) idx++;
    return idx;
  }

  private _nodeSource() {
    return {
      id: this.id,
      type: (this.constructor as typeof IONode).type,
      name: this.name,
    };
  }

  public status(status: IONodeStatus) {
    this.node.status(status);
    const portIdx = this._getStatusPortIndex();
    if (portIdx !== null) {
      this._sendToPort(portIdx, {
        status,
        source: this._nodeSource(),
      });
    }
  }

  public override error(message: string, msg?: any) {
    super.error(message, msg);
    const portIdx = this._getErrorPortIndex();
    if (portIdx !== null && msg) {
      this._sendToPort(portIdx, {
        ...msg,
        error: {
          message,
          source: this._nodeSource(),
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
