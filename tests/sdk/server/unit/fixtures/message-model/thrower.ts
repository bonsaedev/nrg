import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// One base output port (`out`) plus the built-in error port (enabled via config).
// `input()` throws, so the input handler auto-emits to the error port. Used to
// prove the error port's `input` frame is the message the node actually PROCESSED
// the node actually processed.
type ThrowerInput = Input<Port<{ value?: unknown }>>;
type ThrowerOutputs = Outputs<{ out: Port<unknown> }>;

class Thrower extends IONode<never, never, ThrowerInput, ThrowerOutputs> {
  static override readonly type = "message-model-thrower";

  override async input() {
    throw new Error("boom");
  }
}

export default Thrower;
