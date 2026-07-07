import { IONode } from "@/sdk/lib/server";

// Types-first fixture with two positional (tuple) output ports. Sends more slots
// than there are ports to prove the runtime slices to the base-output count and
// wraps each slot independently (extra slots are dropped, null slots skipped).
type Input = { keep?: unknown };
type Output = [unknown, unknown];

class AssignMulti extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-multi";

  override async input() {
    this.send(["first", null, "ignored-extra"] as never);
  }
}

export default AssignMulti;
