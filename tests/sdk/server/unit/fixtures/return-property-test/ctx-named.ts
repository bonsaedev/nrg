import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with CUSTOM NAMED ports (a `Port<T>` record). Sends to
// "failure" (index 1) so `send` resolving the named port's index for the context
// mode can be asserted.
type CtxNamedInput = Input<Port<{ traceId?: string }>>;
type CtxNamedOutputs = Outputs<{
  success: Port<Record<string, unknown>>;
  failure: Port<{ ok: boolean }>;
}>;

class CtxNamed extends IONode<
  Record<string, never>,
  Record<string, never>,
  CtxNamedInput,
  CtxNamedOutputs
> {
  static override readonly type = "ctx-named";

  override async input() {
    this.send("failure", { ok: false });
  }
}

export default CtxNamed;
