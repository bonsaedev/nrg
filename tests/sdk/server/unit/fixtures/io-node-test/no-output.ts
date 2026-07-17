import { IONode, type Input, type Port } from "@/sdk/lib/server";

// Types-first fixture with an input port but NO output port (Output = never), so
// its static topology reports zero base outputs and no named ports.
type NoOutputInput = Input<Port<{ payload?: unknown }>>;
type Output = never;

class NoOutput extends IONode<never, never, NoOutputInput, Output> {
  static override readonly type = "no-output";

  override async input() {}
}

export default NoOutput;
