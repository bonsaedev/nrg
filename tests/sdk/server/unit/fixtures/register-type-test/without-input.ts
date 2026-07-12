import { IONode, type Outputs, type Port } from "@/sdk/lib/server";

// The Input generic is `never`, so this node has NO input port even though its
// topology IS stamped (its typed Output gives one output port). Proves the input
// count comes from the `Input` generic (never = absent), not from stamping alone.
type WithoutInputOutputs = Outputs<{ out: Port<{ value: number }> }>;

class WithoutInput extends IONode<any, any, never, WithoutInputOutputs> {
  static override readonly type = "without-input";
  static override readonly category = "function";
}

export default WithoutInput;
