import { IONode } from "@/sdk/lib/server";

// Types-first fixture with two positional (tuple) output ports. One value per
// port; each port's return property resolves independently from
// `config.outputReturnProperties`.
type Input = { k?: unknown };
type Output = [unknown, unknown];

class AssignMultiReturn extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-multi-return";

  override async input() {
    this.send(["A", "B"]);
  }
}

export default AssignMultiReturn;
