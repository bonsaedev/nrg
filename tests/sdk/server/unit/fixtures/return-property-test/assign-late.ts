import { IONode } from "@/sdk/lib/server";

// Types-first fixture with one input and one dynamic output port. A `fire`
// message schedules a DEFERRED send gated on a module-level promise; the test
// releases the gate after a later message arrives, proving the detached send
// keeps the context of the input that scheduled it (AsyncLocalStorage).
type Input = { fire?: boolean; seq?: number };
type Output = unknown;

let releaseGate: () => void = () => {};
const gate = new Promise<void>((resolve) => (releaseGate = resolve));

/** Resolve the module-level gate so any scheduled deferred send fires. */
function releaseLateGate(): void {
  releaseGate();
}

class AssignLate extends IONode<
  Record<string, never>,
  Record<string, never>,
  Input,
  Output
> {
  static override readonly type = "assign-late";

  override async input(msg: Input) {
    if (msg.fire) {
      void gate.then(() => this.send("late"));
    }
  }
}

export default AssignLate;
export { releaseLateGate };
