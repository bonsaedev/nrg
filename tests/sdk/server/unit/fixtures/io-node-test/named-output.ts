import { IONode, type Port } from "@/sdk/lib/server";

// Types-first fixture with TWO custom NAMED output ports ("ok", "err"), declared
// purely through the Output generic as a `Port<T>` record (no outputsSchema). The
// harness stamps the port names from the types, so `sendToPort("ok"/"err")` and
// `sent("ok"/"err")` resolve by name. Per-port output validation (config-driven)
// applies to `sendToPort` just as it does to `send`.
type Input = { payload?: unknown };
type Output = {
  ok: Port<{ value: unknown }>;
  err: Port<{ reason: string }>;
};

class NamedOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "named-output";

  override async input() {}
}

export default NamedOutput;
