import { IONode } from "@/sdk/lib/server";

// Types-first fixture with one input and one base output port. Throws on `boom`
// (routing to the built-in error port) and otherwise sends a result — the
// built-in complete/error ports carry the input lineage but not the return key.
// The error/complete ports are framework controls, toggled via config.
type Input = { boom?: boolean; id?: number };
type Output = unknown;

class AssignBuiltin extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-builtin";

  override async input(msg: Input) {
    if (msg.boom) {
      throw new Error("kaboom");
    }
    this.send("fine");
  }
}

export default AssignBuiltin;
