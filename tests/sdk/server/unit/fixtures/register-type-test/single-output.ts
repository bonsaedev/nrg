import { IONode } from "@/sdk/lib/server";

// A single object Output → exactly ONE output port. Proves the output-port count
// is derived from the `Output` generic, not from any schema.
type Output = { value: number };

class SingleOutput extends IONode<any, any, any, Output> {
  static override readonly type = "single-output";
  static override readonly category = "function";
}

export default SingleOutput;
