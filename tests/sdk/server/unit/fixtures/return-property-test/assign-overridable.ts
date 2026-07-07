import { IONode } from "@/sdk/lib/server";

// Types-first fixture: single output port. The flow author can override the
// per-port return property via `config.outputReturnProperties` (a framework
// control present on every IONode) — no schema declaration needed.
type Input = { value: number };
type Output = { doubled: number };

class AssignOverridable extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-overridable";

  override async input(msg: Input) {
    this.send({ doubled: msg.value * 2 });
  }
}

export default AssignOverridable;
