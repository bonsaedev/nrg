import { IONode, type Outputs, type Port } from "@/sdk/lib/server";

// A single object Output → exactly ONE output port. Proves the output-port count
// is derived from the `Output` generic, not from any schema.
type SingleOutputOutputs = Outputs<{ out: Port<{ value: number }> }>;

class SingleOutput extends IONode<any, any, any, SingleOutputOutputs> {
  static override readonly type = "single-output";
  static override readonly category = "function";
}

export default SingleOutput;
