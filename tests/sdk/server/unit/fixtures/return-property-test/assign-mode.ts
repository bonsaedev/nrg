import { IONode } from "@/sdk/lib/server";

// Types-first fixture with one input and one dynamic output port. Sends a fixed
// result; the per-port context mode is resolved from the flow-author config
// (`outputContextModes`, a framework control), falling back to "carry".
type Input = { payload?: unknown };
type Output = unknown;

class AssignMode extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-mode";

  override async input() {
    this.send("R");
  }
}

export default AssignMode;
