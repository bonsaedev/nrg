import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with a single output port (`out`). Passes the incoming `n`
// straight through as the sent value. Used to prove a port validates ONLY when
// its per-port `validateOutputs` flag is on and an `outputSchemas` entry exists
// (both flow-author config, framework controls).
type AssignPpValidateInput = Input<Port<{ n?: unknown }>>;
type AssignPpValidateOutputs = Outputs<{ out: Port<{ n: unknown }> }>;

class AssignPpValidate extends IONode<
  never,
  never,
  AssignPpValidateInput,
  AssignPpValidateOutputs
> {
  static override readonly type = "assign-pp-validate";

  override async input(msg: AssignPpValidateInput) {
    this.send("out", { n: msg.n });
  }
}

export default AssignPpValidate;
