import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture: one input, one output port (`out`). Echoes two ROOT fields
// of the incoming message back out — so a test can prove what `input()` actually
// read (which is what the `inputRoot` rebase controls). `foo` lives OUTSIDE a
// typical rebase root, so it proves the rebase is lossy.
type EchoInput = Input<Port<{ value?: unknown; foo?: unknown }>>;
type EchoOutputs = Outputs<{ out: Port<{ seen: unknown; foo: unknown }> }>;

class Echo extends IONode<
  Record<string, never>,
  Record<string, never>,
  EchoInput,
  EchoOutputs
> {
  static override readonly type = "message-model-echo";

  override async input(msg: EchoInput) {
    this.send("out", { seen: msg.value, foo: msg.foo });
  }
}

export default Echo;
