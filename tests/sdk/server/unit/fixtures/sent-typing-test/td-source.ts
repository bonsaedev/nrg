import { IONode } from "@/sdk/lib/server";

// Types-first SOURCE fixture: NO input port (TInput = never), a single output.
// A source emits from outside any input() (here, created()), so it carries no
// incoming message — sent()[i][0] must still be readable as { output: Output },
// NOT collapse to `never`. Proves WrappedPort<V, never> stays sound.
type Output = { event: { id: string } };

class TdSource extends IONode<
  Record<string, never>,
  Record<string, never>,
  never,
  Output
> {
  static override readonly type = "td-source";

  override created() {
    this.send({ event: { id: "x" } });
  }
}

export default TdSource;
