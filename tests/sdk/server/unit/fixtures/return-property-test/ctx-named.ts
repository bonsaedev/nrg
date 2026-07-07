import { IONode, type Port } from "@/sdk/lib/server";

// Types-first fixture with CUSTOM NAMED ports (a `Port<T>` record). Sends to
// "failure" (index 1) so `sendToPort` resolving the named port's index for the
// context mode can be asserted.
type Input = { traceId?: string };
type Output = {
  success: Port<Record<string, unknown>>;
  failure: Port<{ ok: boolean }>;
};

class CtxNamed extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "ctx-named";

  override async input() {
    this.sendToPort("failure", { ok: false });
  }
}

export default CtxNamed;
