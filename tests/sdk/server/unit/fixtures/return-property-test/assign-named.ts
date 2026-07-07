import { IONode, type Port } from "@/sdk/lib/server";

// Types-first fixture with CUSTOM NAMED ports (a `Port<T>` record in the `Output`
// generic). Proves named-port sends are wrapped under the return key and resolve
// by name.
type Input = { traceId?: string };
type Output = {
  success: Port<{ ok: boolean }>;
  failure: Port<Record<string, unknown>>;
};

class AssignNamed extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-named";

  override async input() {
    this.sendToPort("success", { ok: true });
  }
}

export default AssignNamed;
