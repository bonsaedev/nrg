import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with one input and one output port (`out`). Merges a
// single named field (`result`) onto the message record; the port's context
// mode resolves from the flow-author config (`outputContextModes`, a framework
// control on every IONode), falling back to "merge" — so this node proves the
// default, the flow-author `reset` override, and the legacy `passthrough` alias.
type CtxSingleInput = Input<
  Port<{ topic?: string; correlationId?: string; result?: string }>
>;
type CtxSingleOutputs = Outputs<{ out: Port<{ result: string }> }>;

class CtxSingle extends IONode<never, never, CtxSingleInput, CtxSingleOutputs> {
  static override readonly type = "ctx-single";

  override async input() {
    this.send("out", { result: "R" });
  }
}

export default CtxSingle;
