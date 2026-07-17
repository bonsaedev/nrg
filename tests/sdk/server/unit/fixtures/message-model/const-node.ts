import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture: one input, one output port (`out`). Sends a fixed result
// so a test can assert the outgoing message SHAPE (return key, `source` at root,
// `input` frame) independent of the incoming values. Context mode resolves from
// the flow-author config (`outputContextModes`), falling back to `passthrough`.
type ConstInput = Input<Port<{ payload?: unknown }>>;
type ConstOutputs = Outputs<{ out: Port<unknown> }>;

class Const extends IONode<never, never, ConstInput, ConstOutputs> {
  static override readonly type = "message-model-const";

  override async input() {
    this.send("out", "R");
  }
}

export default Const;
