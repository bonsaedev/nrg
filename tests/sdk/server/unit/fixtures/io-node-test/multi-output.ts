import { IONode } from "@/sdk/lib/server";

// Types-first fixture with TWO positional output ports, declared as a tuple
// output (Output = [unknown, unknown]). Its topology (2 base outputs) comes from
// the generic alone. Used to exercise per-port output validation, which is
// config-driven (`validateOutputs` / `outputSchemas` passed per test).
type Input = { payload?: unknown };
type Output = [unknown, unknown];

class MultiOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "multi-output";

  override async input() {}
}

export default MultiOutput;
