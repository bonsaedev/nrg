import { IONode } from "@/sdk/lib/server";

// Types-first fixture for the positional multi-output proof. A tuple `Output`
// declares two ordered base ports, so `sent()[i][0]` and `sent()[i][1]` stay
// positionally typed.
type Output = [{ a: string }, { b: number }];

class TdTuple extends IONode<
  Record<string, never>,
  Record<string, never>,
  unknown,
  Output
> {
  static override readonly type = "td-tuple";

  override async input() {
    this.send([{ a: "x" }, { b: 1 }]);
  }
}

export default TdTuple;
