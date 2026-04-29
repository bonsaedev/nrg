import type { Schema } from "../schemas/types";
import type { RED } from "../../server/types";
import { validator } from "../validator";
import { Node } from "./node";
import type {
  HexColor,
  IONodeContext,
  IONodeContextScope,
  IONodeStatus,
  IONodeConfig,
  IONodeCredentials,
} from "./types";
import { setupContext } from "./utils";

abstract class IONode<
  TConfig = any,
  TCredentials = any,
  TInput = any,
  TOutput = any,
  TSettings = any,
> extends Node<TConfig, TCredentials, TSettings> {
  public static readonly align?: "left" | "right";
  public static readonly color: HexColor;
  public static readonly labelStyle?:
    | "node_label"
    | "node_label_italic"
    | string;
  public static readonly paletteLabel?: string;
  public static readonly inputs?: number = 0;
  public static readonly outputs?: number = 0;
  public static readonly inputLabels?: string | string[];
  public static readonly outputLabels?: string | string[];
  public static readonly inputSchema?: Schema;
  public static readonly outputsSchema?: Schema | Schema[];
  public static readonly validateInput: boolean = false;
  public static readonly validateOutput: boolean = false;

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
    node: any,
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

  public abstract input(msg: TInput): void | Promise<void>;

  // NOTE: used by the registered function. Had to be a different one to avoid calling the parent's input again
  /** @internal */
  public async _input(msg: TInput, send: (msg: any) => void) {
    const NodeClass = this.constructor as typeof IONode;
    const shouldValidateInput =
      this.config.validateInput ?? NodeClass.validateInput;
    if (shouldValidateInput && NodeClass.inputSchema) {
      this.log("Validating input");
      validator.validate(msg, NodeClass.inputSchema, {
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
          validator.validate(msgs[i], schemas[i], {
            cacheKey: schemas[i].$id || `${NodeClass.type}:output-schema:${i}`,
            throwOnError: true,
          });
        }
      } else if (Array.isArray(msg)) {
        // Single schema, array of messages: validate each non-null element
        for (let i = 0; i < (msg as any[]).length; i++) {
          if ((msg as any[])[i] == null) continue;
          validator.validate((msg as any[])[i], schemas, {
            cacheKey: schemas.$id || `${NodeClass.type}:output-schema`,
            throwOnError: true,
          });
        }
      } else {
        // Single schema, single message
        validator.validate(msg, schemas, {
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

  public status(status: IONodeStatus) {
    this.node.status(status);
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
