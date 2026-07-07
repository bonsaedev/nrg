import { IONode } from "@/sdk/lib/server";

// Types-first fixture for the untyped-output proof. An `any` `Output` stays fully
// permissive: any port name or index and any message, on both the write side
// (`sendToPort`/`send`) and the read side (`sent`).
type Output = any;

class TdAnyOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  unknown,
  Output
> {
  static override readonly type = "td-any-output";

  override async input() {
    this.sendToPort("whatever", { anything: true });
    this.sendToPort(3, 123);
    this.send({ free: "form" });
  }
}

export default TdAnyOutput;
