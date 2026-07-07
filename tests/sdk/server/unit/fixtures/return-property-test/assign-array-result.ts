import { IONode } from "@/sdk/lib/server";

// Types-first fixture with a single, dynamic output port (`Output = unknown`).
// Sends an array as the port value; a single-output node treats the whole array
// as the value (no port fanout).
type Input = { size: number };
type Output = unknown;

class AssignArrayResult extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-array-result";

  override async input(msg: Input) {
    this.send(Array.from({ length: msg.size }, (_, i) => ({ id: i })));
  }
}

export default AssignArrayResult;
