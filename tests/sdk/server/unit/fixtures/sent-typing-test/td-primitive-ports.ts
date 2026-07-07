import { IONode, type Port } from "@/sdk/lib/server";

// Types-first fixture proving a record with PRIMITIVE-valued ports stays fully
// addressable: each value is a `Port<primitive>` marker, so both ports keep their
// names (a bare `string`/`number` value would not read as a named port).
type Output = {
  success: Port<string>;
  failure: Port<number>;
};

class TdPrimitivePorts extends IONode<
  Record<string, never>,
  Record<string, never>,
  unknown,
  Output
> {
  static override readonly type = "td-primitive-ports";

  override async input() {
    this.sendToPort("success", "ok");
    this.sendToPort("failure", 1);
  }
}

export default TdPrimitivePorts;
