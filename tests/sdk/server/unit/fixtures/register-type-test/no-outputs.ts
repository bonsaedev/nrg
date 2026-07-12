import { IONode, type Input, type Port } from "@/sdk/lib/server";

// The Output generic is `never`, so this node has NO output port even though its
// topology IS stamped (its typed Input gives one input port). Proves the output
// count comes from the `Output` generic (never = absent), not from stamping alone.
type NoOutputsInput = Input<Port<{ payload?: unknown }>>;

class NoOutputs extends IONode<any, any, NoOutputsInput, never> {
  static override readonly type = "no-outputs";
  static override readonly category = "function";

  override async input(_msg: NoOutputsInput) {}
}

export default NoOutputs;
