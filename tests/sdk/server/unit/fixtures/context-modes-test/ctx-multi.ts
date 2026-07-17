import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with two named output ports (`out0`, `out1`) — one named
// field per port, so each port's resolved context mode (merge vs reset) can be
// asserted independently on the same input.
type CtxMultiInput = Input<Port<{ k?: number }>>;
type CtxMultiOutputs = Outputs<{
  out0: Port<{ a: string }>;
  out1: Port<{ b: string }>;
}>;

class CtxMulti extends IONode<never, never, CtxMultiInput, CtxMultiOutputs> {
  static override readonly type = "ctx-multi";

  override async input() {
    this.send("out0", { a: "A" });
    this.send("out1", { b: "B" });
  }
}

export default CtxMulti;
