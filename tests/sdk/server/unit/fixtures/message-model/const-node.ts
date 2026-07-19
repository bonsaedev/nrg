import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture: one input, one output port (`out`). Merges a fixed
// `result` field so a test can assert the outgoing RECORD shape (carried
// incoming fields + additions + the `_meta` provenance carrier) independent of
// the incoming values.
type ConstInput = Input<Port<{ payload?: unknown }>>;
type ConstOutputs = Outputs<{ out: Port<unknown> }>;

class Const extends IONode<never, never, ConstInput, ConstOutputs> {
  static override readonly type = "message-model-const";

  override async input() {
    this.send("out", { result: "R" });
  }
}

export default Const;
