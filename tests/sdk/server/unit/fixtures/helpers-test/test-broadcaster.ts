import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// A types-first fan-out node: two named output ports. Emits the same payload to
// both ports at once (no config schema).
type TestBroadcasterInput = Input<Port<{ payload?: unknown }>>;
type OutMsg = { payload: unknown; port: number };
type TestBroadcasterOutputs = Outputs<{
  out0: Port<OutMsg>;
  out1: Port<OutMsg>;
}>;

class TestBroadcaster extends IONode<
  any,
  Record<string, never>,
  TestBroadcasterInput,
  TestBroadcasterOutputs
> {
  static override readonly type = "test-broadcaster";
  static override readonly category = "function";

  override async input(msg: TestBroadcasterInput) {
    this.send("out0", { payload: msg.payload, port: 0 });
    this.send("out1", { payload: msg.payload, port: 1 });
  }
}

export default TestBroadcaster;
