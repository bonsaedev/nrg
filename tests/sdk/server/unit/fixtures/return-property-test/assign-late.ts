import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture with one input and one output port (`out`). A `fire`
// message schedules a DEFERRED send gated on a module-level promise; the test
// releases the gate after a later message arrives, proving the detached send
// keeps the context of the input that scheduled it (AsyncLocalStorage).
type AssignLateInput = Input<Port<{ fire?: boolean; seq?: number }>>;
type AssignLateOutputs = Outputs<{ out: Port<unknown> }>;

let releaseGate: () => void = () => {};
const gate = new Promise<void>((resolve) => (releaseGate = resolve));

/** Resolve the module-level gate so any scheduled deferred send fires. */
function releaseLateGate(): void {
  releaseGate();
}

class AssignLate extends IONode<
  Record<string, never>,
  Record<string, never>,
  AssignLateInput,
  AssignLateOutputs
> {
  static override readonly type = "assign-late";

  override async input(msg: AssignLateInput) {
    if (msg.fire) {
      void gate.then(() => this.send("out", "late"));
    }
  }
}

export default AssignLate;
export { releaseLateGate };
