import { IONode, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first SOURCE fixture: NO input port (TInput = never), a single output.
// A source emits from outside any input() (here, created()), so it carries no
// incoming message — sent()[i][0] must still be readable as { output: Output },
// NOT collapse to `never`. Proves WrappedPort<V, never> stays sound.
type TdSourceOutputs = Outputs<{ out: Port<{ event: { id: string } }> }>;

class TdSource extends IONode<never, never, never, TdSourceOutputs> {
  static override readonly type = "td-source";

  override created() {
    this.send("out", { event: { id: "x" } });
  }
}

export default TdSource;
