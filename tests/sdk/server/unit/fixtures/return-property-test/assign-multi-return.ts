import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with two named output ports (`out0`, `out1`). One value per
// port; each port's return property resolves independently from
// `config.outputReturnProperties`.
type AssignMultiReturnInput = Input<Port<{ k?: unknown }>>;
type AssignMultiReturnOutputs = Outputs<{
  out0: Port<unknown>;
  out1: Port<unknown>;
}>;

class AssignMultiReturn extends IONode<
  Record<string, never>,
  Record<string, never>,
  AssignMultiReturnInput,
  AssignMultiReturnOutputs
> {
  static override readonly type = "assign-multi-return";

  override async input() {
    this.send("out0", "A");
    this.send("out1", "B");
  }
}

export default AssignMultiReturn;
