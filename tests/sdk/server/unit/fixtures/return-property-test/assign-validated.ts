import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with a single typed output port (`out`). Proves per-port
// output validation checks the RAW sent value (`{ doubled }`), not the wrapped
// message. Validation is enabled by the flow-author `validateOutputs`/
// `outputSchemas` config (a framework control on every IONode).
type AssignValidatedInput = Input<Port<{ value: number }>>;
type AssignValidatedOutputs = Outputs<{ out: Port<{ doubled: number }> }>;

class AssignValidated extends IONode<
  never,
  never,
  AssignValidatedInput,
  AssignValidatedOutputs
> {
  static override readonly type = "assign-validated";

  override async input(msg: AssignValidatedInput) {
    this.send("out", { doubled: msg.value * 2 });
  }
}

export default AssignValidated;
