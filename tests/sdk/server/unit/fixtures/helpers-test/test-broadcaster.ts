import { IONode } from "@/sdk/lib/server";

// A types-first fan-out node: two positional output ports from the `Output` tuple
// generic. Emits the same payload to both ports at once (no config schema).
type Input = { payload?: unknown };
type OutMsg = { payload: unknown; port: number };
type Output = [OutMsg, OutMsg];

class TestBroadcaster extends IONode<
  any,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "test-broadcaster";
  static override readonly category = "function";

  override async input(msg: Input) {
    this.send([
      { payload: msg.payload, port: 0 },
      { payload: msg.payload, port: 1 },
    ]);
  }
}

export default TestBroadcaster;
