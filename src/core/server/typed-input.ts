import type { RED, NodeRedNode } from "./types";
import type { TypedInputType } from "./schemas/types";

export default class TypedInput<T = unknown> {
  private readonly resolvers: Partial<
    Record<TypedInputType, (raw: any) => any>
  > = {
    // NOTE: NRG nodes are wrapped — surface the NRG instance, fall back to raw NodeRedNode
    node: (raw) => raw?._node ?? raw,
  };

  constructor(
    private readonly RED: RED,
    private readonly node: NodeRedNode,
    private readonly input: { value: unknown; type: TypedInputType },
  ) {}

  get type(): TypedInputType {
    return this.input.type;
  }

  get value(): unknown {
    return this.input.value;
  }

  resolve(msg?: Record<string, any>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.RED.util.evaluateNodeProperty(
        this.input.value,
        this.input.type,
        this.node,
        msg,
        (err: Error | null, raw: any) => {
          if (err) return reject(err);
          const post = this.resolvers[this.input.type];
          resolve((post ? post(raw) : raw) as T);
        },
      );
    });
  }
}
