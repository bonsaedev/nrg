import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// One base output port (`out`) plus the built-in complete port (enabled via
// config). `input()` returns a value, so the auto-emitted complete frame carries
// it under `complete`. Used to prove the complete port's `input` frame is the
// message the node actually PROCESSED (rebased by `inputRoot`), not the raw one.
type CompleterInput = Input<Port<{ value?: unknown }>>;
type CompleterOutputs = Outputs<{ out: Port<unknown> }>;

class Completer extends IONode<
  Record<string, never>,
  Record<string, never>,
  CompleterInput,
  CompleterOutputs
> {
  static override readonly type = "message-model-completer";

  override async input(msg: CompleterInput) {
    return { done: msg.value };
  }
}

export default Completer;
