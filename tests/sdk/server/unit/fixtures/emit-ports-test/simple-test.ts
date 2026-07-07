import { IONode } from "@/sdk/lib/server";

// A node with NO config schema (so no built-in port flags) — its one input and
// one base output port still come purely from the generics.
type Input = { payload?: unknown };
type Output = { payload?: unknown };

class SimpleTest extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "simple-test";

  override async input(msg: Input) {
    this.send(msg);
  }
}

export default SimpleTest;
