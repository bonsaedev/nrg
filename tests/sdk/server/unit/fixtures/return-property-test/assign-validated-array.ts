import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with a single output port (`out`). Sends an array as the
// port value; used to prove arrays stay the value even when per-port output
// validation is enabled (via the flow-author `validateOutputs`/`outputSchemas`
// config, a framework control on every IONode).
type AssignValidatedArrayInput = Input<Port<{ size: number }>>;
type AssignValidatedArrayOutputs = Outputs<{ out: Port<unknown> }>;

class AssignValidatedArray extends IONode<
  never,
  never,
  AssignValidatedArrayInput,
  AssignValidatedArrayOutputs
> {
  static override readonly type = "assign-validated-array";

  override async input(msg: AssignValidatedArrayInput) {
    this.send(
      "out",
      Array.from({ length: msg.size }, (_, i) => ({ id: i })),
    );
  }
}

export default AssignValidatedArray;
