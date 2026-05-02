import type { RED, NodeRedNode } from "./types";
import type { TypedInputType } from "./schemas/types";

export default class TypedInput<T = unknown> {
  private readonly resolvers: Partial<
    Record<TypedInputType, (raw: any) => any>
  > = {
    // evaluateNodeProperty returns the node ID string for "node" type —
    // resolve it to the actual node instance via RED.nodes.getNode,
    // then surface the NRG wrapper if available.
    node: (raw) => {
      if (typeof raw === "string") {
        const node = this.RED.nodes.getNode(raw);
        return node?._node ?? node ?? raw;
      }
      return raw?._node ?? raw;
    },
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
