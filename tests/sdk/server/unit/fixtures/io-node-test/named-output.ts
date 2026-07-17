import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with TWO custom NAMED output ports ("ok", "err"), declared
// purely through the Output generic as a `Port<T>` record (no outputsSchema). The
// harness stamps the port names from the types, so `send("ok"/"err")` and
// `sent("ok"/"err")` resolve by name. Per-port output validation (config-driven)
// applies to `send` on a named port just as it does to a numeric one.
type NamedOutputInput = Input<Port<{ payload?: unknown }>>;
type NamedOutputOutputs = Outputs<{
  ok: Port<{ value: unknown }>;
  err: Port<{ reason: string }>;
}>;

class NamedOutput extends IONode<
  never,
  never,
  NamedOutputInput,
  NamedOutputOutputs
> {
  static override readonly type = "named-output";

  override async input() {}
}

export default NamedOutput;
