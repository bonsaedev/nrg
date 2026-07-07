import { IONode } from "@/sdk/lib/server";

// Types-first fixture with two positional (tuple) output ports — one value per
// port, so each port's resolved context mode can be asserted independently.
type Input = { k?: unknown };
type Output = [unknown, unknown];

class CtxMulti extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "ctx-multi";

  override async input() {
    this.send(["A", "B"]);
  }
}

export default CtxMulti;
