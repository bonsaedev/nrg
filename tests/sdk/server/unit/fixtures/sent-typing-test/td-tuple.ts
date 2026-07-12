import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture for the positional multi-output proof. A tuple `Output`
// declares two ordered base ports, so `sent()[i][0]` and `sent()[i][1]` stay
// positionally typed.
type TdTupleOutputs = Outputs<{ out0: Port<{ a: string }>; out1: Port<{ b: number }> }>;

class TdTuple extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input<Port<unknown>>,
  TdTupleOutputs
> {
  static override readonly type = "td-tuple";

  override async input() {
    this.send("out0", { a: "x" });
    this.send("out1", { b: 1 });
  }
}

export default TdTuple;
