import { IONode } from "@/sdk/lib/server";

// A positional tuple Output → one port per element (THREE output ports). Proves a
// multi-output topology is derived from the tuple `Output` generic.
type Output = [{ a: number }, { b: number }, { c: number }];

class MultiOutputs extends IONode<any, any, any, Output> {
  static override readonly type = "multi-outputs";
  static override readonly category = "function";
}

export default MultiOutputs;
