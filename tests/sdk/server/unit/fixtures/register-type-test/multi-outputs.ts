import { IONode, type Outputs, type Port } from "@/sdk/lib/server";

// A positional tuple Output → one port per element (THREE output ports). Proves a
// multi-output topology is derived from the named `Output` generic.
type MultiOutputsOutputs = Outputs<{
  out0: Port<{ a: number }>;
  out1: Port<{ b: number }>;
  out2: Port<{ c: number }>;
}>;

class MultiOutputs extends IONode<any, any, any, MultiOutputsOutputs> {
  static override readonly type = "multi-outputs";
  static override readonly category = "function";
}

export default MultiOutputs;
