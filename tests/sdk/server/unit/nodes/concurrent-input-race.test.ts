import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import { createNode } from "@/sdk/test/server/unit";
import RacyIo, {
  configureRacyIo,
} from "../fixtures/concurrent-input-race-test/racy-io";

/**
 * Guards the per-invocation context scope in io-node.ts (the `inputInvocation`
 * AsyncLocalStorage).
 *
 * Real Node-RED never awaits an async input handler before delivering the next
 * message (its `emit('input')`/`receive` are fire-and-forget, delivery is
 * `setImmediate`, and `done()` is completion tracking, not back-pressure), so
 * two messages can be in flight on one node at once. The carried output context
 * (the spread base in `#wrapOutgoing`) must therefore be scoped per input()
 * call, not stored on a shared instance field — otherwise the second message
 * overwrites it while the first is still awaiting, and the first input emits
 * with the second's context.
 *
 * The unit harness's mock `emit` awaits the handler, so awaited `receive()`
 * calls serialize; calling `receive()` WITHOUT awaiting reproduces real
 * Node-RED's overlapping delivery. A shared gate makes the interleaving
 * deterministic. Before the fix, the first assertion below was `"B"`.
 *
 * The racy node is a types-only fixture (`racy-io.ts`): its ports come from its
 * generics, so the harness must type-extract topology from the fixture tree —
 * point `NRG_SERVER_SRC` at it. The per-test gate/started array are injected via
 * `configureRacyIo`, the seam that replaces the original inline closure.
 */
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/concurrent-input-race-test", import.meta.url),
);

describe("io-node concurrent-input race", () => {
  let prevSrc: string | undefined;

  beforeAll(() => {
    prevSrc = process.env.NRG_SERVER_SRC;
    process.env.NRG_SERVER_SRC = FIXTURE_DIR;
  });

  afterAll(() => {
    if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
    else process.env.NRG_SERVER_SRC = prevSrc;
  });

  it("keeps each input's carried context independent under overlap (per-invocation scope)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const started: string[] = [];
    configureRacyIo({ started, gate });

    const { node } = await createNode(RacyIo, { config: {} });

    // Two overlapping inputs — NOT awaited, mirroring real Node-RED, which
    // delivers msg B before msg A's handler (and its done()) has finished.
    const a = node.receive({ id: "A", payload: "a" });
    const b = node.receive({ id: "B", payload: "b" });

    // Both inputs have entered input() and parked at the gate; by now the
    // instance field #currentInputMsg has been overwritten to B.
    await vi.waitFor(() => expect(started).toEqual(["A", "B"]));

    release();
    await Promise.all([a, b]);

    // `Record<string, any>` to read the trace-mode `input` provenance frame,
    // which the typed port shape doesn't model (same idiom as return-property).
    const first = node.sent()[0][0] as Record<string, any>;
    const second = node.sent()[1][0] as Record<string, any>;

    // A resumes first. Both its value AND its carried context (under `input`) are
    // A's, even though B overwrote the shared instance field while A was awaiting
    // — because the context is scoped to A's invocation. (Pre-fix this was "B".)
    expect(first.output.echoedId).toBe("A");
    expect(first.input.id).toBe("A");

    // B is likewise internally consistent.
    expect(second.output.echoedId).toBe("B");
    expect(second.input.id).toBe("B");
  });

  it("CONTROL: sequential (awaited) inputs never cross — isolates the cause to overlap", async () => {
    // With each input fully drained before the next (gate already open), there
    // is no overlap, so context would be correct even without per-call scoping.
    const started: string[] = [];
    configureRacyIo({ started, gate: Promise.resolve() });

    const { node } = await createNode(RacyIo, { config: {} });

    await node.receive({ id: "A", payload: "a" });
    await node.receive({ id: "B", payload: "b" });

    // `Record<string, any>` to read the trace-mode `input` provenance frame,
    // which the typed port shape doesn't model (same idiom as return-property).
    const first = node.sent()[0][0] as Record<string, any>;
    const second = node.sent()[1][0] as Record<string, any>;

    expect(first.input.id).toBe("A");
    expect(first.output.echoedId).toBe("A");
    expect(second.input.id).toBe("B");
    expect(second.output.echoedId).toBe("B");
  });
});
