import { IONode } from "@/sdk/lib/server";

// Types-first fixture with a single typed output port. Proves per-port output
// validation checks the RAW sent value (`{ doubled }`), not the wrapped message.
// Validation is enabled by the flow-author `validateOutputs`/`outputSchemas`
// config (a framework control on every IONode).
type Input = { value: number };
type Output = { doubled: number };

class AssignValidated extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-validated";

  override async input(msg: Input) {
    this.send({ doubled: msg.value * 2 });
  }
}

export default AssignValidated;
