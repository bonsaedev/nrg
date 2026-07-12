import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture for the NAMED multi-output proof. Its `Output` is a named
// record (out0/out1): precise per-port typing is via `sent(name)`, since the
// positional `sent()[i][0]`/`[i][1]` collapses to the sound UNION of the ports'
// values (record/tuple key order isn't type-recoverable). Named "td-tuple" for
// its multi-ordered-port heritage — the fixture itself is a record.
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
