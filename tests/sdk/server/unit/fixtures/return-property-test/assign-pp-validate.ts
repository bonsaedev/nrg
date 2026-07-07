import { IONode } from "@/sdk/lib/server";

// Types-first fixture with a single output port. Passes the incoming `n` straight
// through as the sent value. Used to prove a port validates ONLY when its
// per-port `validateOutputs` flag is on and an `outputSchemas` entry exists
// (both flow-author config, framework controls).
type Input = { n?: unknown };
type Output = { n: unknown };

class AssignPpValidate extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-pp-validate";

  override async input(msg: Input) {
    this.send({ n: msg.n });
  }
}

export default AssignPpValidate;
