import { IONode } from "@/sdk/lib/server";

// The Input generic is untyped (`any` → vacuous), so this node has NO input port
// even though its topology IS stamped (its typed Output gives one output port).
// Proves the input count comes from the `Input` generic, not from stamping alone.
type Output = { value: number };

class WithoutInput extends IONode<any, any, any, Output> {
  static override readonly type = "without-input";
  static override readonly category = "function";
}

export default WithoutInput;
