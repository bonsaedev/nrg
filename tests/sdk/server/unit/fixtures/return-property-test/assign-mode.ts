import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with one input and one output port (`out`). Sends a fixed
// result; the per-port context mode is resolved from the flow-author config
// (`outputContextModes`, a framework control), falling back to "passthrough".
type AssignModeInput = Input<Port<{ payload?: unknown }>>;
type AssignModeOutputs = Outputs<{ out: Port<unknown> }>;

class AssignMode extends IONode<
  never,
  never,
  AssignModeInput,
  AssignModeOutputs
> {
  static override readonly type = "assign-mode";

  override async input() {
    this.send("out", "R");
  }
}

export default AssignMode;
