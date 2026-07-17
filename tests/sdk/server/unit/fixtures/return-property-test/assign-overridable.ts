import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture: single output port (`out`). The flow author can override
// the per-port return property via `config.outputReturnProperties` (a framework
// control present on every IONode) — no schema declaration needed.
type AssignOverridableInput = Input<Port<{ value: number }>>;
type AssignOverridableOutputs = Outputs<{ out: Port<{ doubled: number }> }>;

class AssignOverridable extends IONode<
  never,
  never,
  AssignOverridableInput,
  AssignOverridableOutputs
> {
  static override readonly type = "assign-overridable";

  override async input(msg: AssignOverridableInput) {
    this.send("out", { doubled: msg.value * 2 });
  }
}

export default AssignOverridable;
