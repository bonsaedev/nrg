import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with one input and one output port (`out`). Throws on `boom`
// (routing to the built-in error port) and otherwise sends a result — the
// built-in complete/error ports carry the input lineage but not the return key.
// The error/complete ports are framework controls, toggled via config.
type AssignBuiltinInput = Input<Port<{ boom?: boolean; id?: number }>>;
type AssignBuiltinOutputs = Outputs<{ out: Port<unknown> }>;

class AssignBuiltin extends IONode<
  never,
  never,
  AssignBuiltinInput,
  AssignBuiltinOutputs
> {
  static override readonly type = "assign-builtin";

  override async input(msg: AssignBuiltinInput) {
    if (msg.boom) {
      throw new Error("kaboom");
    }
    this.send("out", "fine");
  }
}

export default AssignBuiltin;
