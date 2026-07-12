import { IONode, type Input, type Port } from "@/sdk/lib/server";

// Types-first fixture for the untyped-output proof. An `any` `Output` stays fully
// permissive: any port name or index and any message, on both the write side
// (`send`) and the read side (`sent`).
type Output = any;

class TdAnyOutput extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input<Port<unknown>>,
  Output
> {
  static override readonly type = "td-any-output";

  override async input() {
    this.send("whatever", { anything: true });
    this.send(3, 123);
    this.send("out", { free: "form" });
  }
}

export default TdAnyOutput;
