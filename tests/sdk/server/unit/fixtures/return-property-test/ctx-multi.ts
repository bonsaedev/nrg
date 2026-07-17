import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with two named output ports (`out0`, `out1`) — one value per
// port, so each port's resolved context mode can be asserted independently.
type CtxMultiInput = Input<Port<{ k?: unknown }>>;
type CtxMultiOutputs = Outputs<{ out0: Port<unknown>; out1: Port<unknown> }>;

class CtxMulti extends IONode<never, never, CtxMultiInput, CtxMultiOutputs> {
  static override readonly type = "ctx-multi";

  override async input() {
    this.send("out0", "A");
    this.send("out1", "B");
  }
}

export default CtxMulti;
