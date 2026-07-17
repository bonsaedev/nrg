import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with CUSTOM NAMED ports (a `Port<T>` record in the `Outputs`
// generic). Proves named-port sends are wrapped under the return key and resolve
// by name.
type AssignNamedInput = Input<Port<{ traceId?: string }>>;
type AssignNamedOutputs = Outputs<{
  success: Port<{ ok: boolean }>;
  failure: Port<Record<string, unknown>>;
}>;

class AssignNamed extends IONode<
  never,
  never,
  AssignNamedInput,
  AssignNamedOutputs
> {
  static override readonly type = "assign-named";

  override async input() {
    this.send("success", { ok: true });
  }
}

export default AssignNamed;
