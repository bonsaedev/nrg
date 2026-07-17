import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with two named output ports (`out0`, `out1`). Sends only to
// `out0` (leaving `out1` empty) to prove each port is wrapped independently — a
// value on one port never bleeds onto the other.
type AssignMultiInput = Input<Port<{ keep?: unknown }>>;
type AssignMultiOutputs = Outputs<{ out0: Port<unknown>; out1: Port<unknown> }>;

class AssignMulti extends IONode<
  never,
  never,
  AssignMultiInput,
  AssignMultiOutputs
> {
  static override readonly type = "assign-multi";

  override async input() {
    this.send("out0", "first");
  }
}

export default AssignMulti;
