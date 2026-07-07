import { IONode, type Port } from "@/sdk/lib/server";

// Types-first fixture for the named-port (record) proof. A `Port<T>` record in the
// `Output` generic declares two NAMED ports, so `sent("success")`/`sent("failure")`
// resolve by name with per-port message typing.
type Output = {
  success: Port<{ ok: string }>;
  failure: Port<{ err: number }>;
};

class TdRecord extends IONode<
  Record<string, never>,
  Record<string, never>,
  unknown,
  Output
> {
  static override readonly type = "td-record";

  override async input() {
    this.sendToPort("success", { ok: "y" });
  }
}

export default TdRecord;
