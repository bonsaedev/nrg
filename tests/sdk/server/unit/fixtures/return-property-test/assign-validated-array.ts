import { IONode } from "@/sdk/lib/server";

// Types-first fixture with a single dynamic output port. Sends an array as the
// port value; used to prove arrays stay the value even when per-port output
// validation is enabled (via the flow-author `validateOutputs`/`outputSchemas`
// config, a framework control on every IONode).
type Input = { size: number };
type Output = unknown;

class AssignValidatedArray extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-validated-array";

  override async input(msg: Input) {
    this.send(Array.from({ length: msg.size }, (_, i) => ({ id: i })));
  }
}

export default AssignValidatedArray;
