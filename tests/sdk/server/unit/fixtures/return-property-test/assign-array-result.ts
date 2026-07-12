import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with a single output port (`out`, `Port<unknown>`). Sends
// an array as the port value; a single-output node treats the whole array as the
// value (no port fanout).
type AssignArrayResultInput = Input<Port<{ size: number }>>;
type AssignArrayResultOutputs = Outputs<{ out: Port<unknown> }>;

class AssignArrayResult extends IONode<
  Record<string, never>,
  Record<string, never>,
  AssignArrayResultInput,
  AssignArrayResultOutputs
> {
  static override readonly type = "assign-array-result";

  override async input(msg: AssignArrayResultInput) {
    this.send("out", Array.from({ length: msg.size }, (_, i) => ({ id: i })));
  }
}

export default AssignArrayResult;
