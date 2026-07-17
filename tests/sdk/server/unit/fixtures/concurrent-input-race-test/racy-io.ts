import { IONode, type Input, type Outputs, type Port } from "@/sdk/lib/server";

// Types-first fixture for the concurrent-input race test. Its one input port and
// one output port come purely from the generics (no inputSchema/outputsSchema);
// the harness stamps that topology from this source tree.
//
// The node parks at a shared `gate` inside input() so the test can hold two
// overlapping invocations in flight at once — mirroring real Node-RED, whose
// delivery never awaits the handler. `started` records the order inputs enter
// input(). Both are injected per-test via `configureRacyIo` so the two cases
// don't share a gate — the same seam the original inline closure provided.
type RacyIoInput = Input<Port<{ id: string; payload?: unknown }>>;
type RacyIoOutputs = Outputs<{ out: Port<{ echoedId: string }> }>;

let started: string[] = [];
let gate: Promise<void> = Promise.resolve();

function configureRacyIo(next: {
  started: string[];
  gate: Promise<void>;
}): void {
  started = next.started;
  gate = next.gate;
}

class RacyIo extends IONode<never, never, RacyIoInput, RacyIoOutputs> {
  static override readonly type = "racy-io";

  override async input(msg: RacyIoInput) {
    const id = msg.id;
    started.push(id);
    await gate; // park here while the next input arrives
    // The VALUE carries the id from this call's closure (always correct); the
    // carried context comes from the per-invocation `inputInvocation` store —
    // pre-fix it came from a shared instance field and crossed under overlap.
    this.send("out", { echoedId: id });
  }
}

export default RacyIo;
export { configureRacyIo };
