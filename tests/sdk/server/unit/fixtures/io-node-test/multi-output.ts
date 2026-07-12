import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with TWO output ports, declared as a named-port record
// (out0/out1). Its topology (2 base outputs) comes from the generic alone. Used
// to exercise per-port output validation, which is config-driven
// (`validateOutputs` / `outputSchemas` passed per test).
type MultiOutputInput = Input<Port<{ payload?: unknown }>>;
type MultiOutputOutputs = Outputs<{ out0: Port<unknown>; out1: Port<unknown> }>;

class MultiOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  MultiOutputInput,
  MultiOutputOutputs
> {
  static override readonly type = "multi-output";

  override async input() {}
}

export default MultiOutput;
