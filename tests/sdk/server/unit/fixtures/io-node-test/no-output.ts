import { IONode } from "@/sdk/lib/server";

// Types-first fixture with an input port but NO output port (Output = void), so
// its static topology reports zero base outputs and no named ports.
type Input = { payload?: unknown };
type Output = void;

class NoOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "no-output";

  override async input() {}
}

export default NoOutput;
