import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture for the single-output `sent()` proof. Its one input and one
// output port come purely from the generics (no inputSchema/outputsSchema); the
// harness stamps the topology from this source dir so `sent()[0][0]` addresses the
// single base output.
type TdSingleInput = Input<Port<{ in: string }>>;
type TdSingleOutputs = Outputs<{ out: Port<{ id: string }> }>;

class TdSingle extends IONode<
  Record<string, never>,
  Record<string, never>,
  TdSingleInput,
  TdSingleOutputs
> {
  static override readonly type = "td-single";

  override async input() {
    this.send("out", { id: "x" });
  }
}

export default TdSingle;
