import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// A node with NO config schema (so no built-in port flags) — its one input and
// one base output port still come purely from the generics.
type SimpleTestInput = Input<Port<{ payload?: unknown }>>;
type SimpleTestOutputs = Outputs<{ out: Port<{ payload?: unknown }> }>;

class SimpleTest extends IONode<
  never,
  never,
  SimpleTestInput,
  SimpleTestOutputs
> {
  static override readonly type = "simple-test";

  override async input(msg: SimpleTestInput) {
    this.send("out", msg);
  }
}

export default SimpleTest;
