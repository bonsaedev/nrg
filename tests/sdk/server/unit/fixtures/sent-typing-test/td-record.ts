import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture for the named-port (record) proof. A `Port<T>` record in the
// `Output` generic declares two NAMED ports, so `sent("success")`/`sent("failure")`
// resolve by name with per-port message typing.
type TdRecordOutputs = Outputs<{
  success: Port<{ ok: string }>;
  failure: Port<{ err: number }>;
}>;

class TdRecord extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input<Port<unknown>>,
  TdRecordOutputs
> {
  static override readonly type = "td-record";

  override async input() {
    this.send("success", { ok: "y" });
  }
}

export default TdRecord;
