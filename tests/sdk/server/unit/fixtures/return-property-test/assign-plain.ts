import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture: one input and one output port (`out`) come from the
// generics. Sends a plain object result; the runtime wraps it under the default
// `output` return key.
type AssignPlainInput = Input<Port<{ value: number }>>;
type AssignPlainOutputs = Outputs<{ out: Port<{ doubled: number }> }>;

class AssignPlain extends IONode<
  Record<string, never>,
  Record<string, never>,
  AssignPlainInput,
  AssignPlainOutputs
> {
  static override readonly type = "assign-plain";

  override async input(msg: AssignPlainInput) {
    this.send("out", { doubled: msg.value * 2 });
  }
}

export default AssignPlain;
