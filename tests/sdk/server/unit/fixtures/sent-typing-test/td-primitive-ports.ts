import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture proving a record with PRIMITIVE-valued ports stays fully
// addressable: each value is a `Port<primitive>` marker, so both ports keep their
// names (a bare `string`/`number` value would not read as a named port).
type TdPrimitivePortsOutputs = Outputs<{
  success: Port<string>;
  failure: Port<number>;
}>;

class TdPrimitivePorts extends IONode<
  never,
  never,
  Input<Port<unknown>>,
  TdPrimitivePortsOutputs
> {
  static override readonly type = "td-primitive-ports";

  override async input() {
    this.send("success", "ok");
    this.send("failure", 1);
  }
}

export default TdPrimitivePorts;
