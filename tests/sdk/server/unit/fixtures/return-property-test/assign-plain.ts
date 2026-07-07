import { IONode } from "@/sdk/lib/server";

// Types-first fixture: one input and one base output port come from the generics.
// Sends a plain object result; the runtime wraps it under the default `output`
// return key.
type Input = { value: number };
type Output = { doubled: number };

class AssignPlain extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-plain";

  override async input(msg: Input) {
    this.send({ doubled: msg.value * 2 });
  }
}

export default AssignPlain;
