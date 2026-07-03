import { describe, it, expect, vi } from "vitest";
import { createNode } from "@/test/server/unit";
import { defineIONode } from "@/core/server/nodes";
import { SchemaType } from "@/core/shared/schemas";

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
 */

function gatedRacyNode(started: string[], gate: Promise<void>) {
  return defineIONode({
    type: "racy-io",
    inputSchema: SchemaType.Object({}),
    outputsSchema: SchemaType.Object({}),
    async input(msg) {
      const id = (msg as { id: string }).id;
      started.push(id);
      await gate; // park here while the next input arrives
      // the VALUE carries the id from this call's closure (always correct);
      // the carried context comes from the per-invocation `inputInvocation`
      // store — pre-fix it came from a shared instance field and crossed.
      this.send({ echoedId: id });
    },
  });
}

describe("io-node concurrent-input race", () => {
  it("keeps each input's carried context independent under overlap (per-invocation scope)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const started: string[] = [];

    const { node } = await createNode(gatedRacyNode(started, gate), {
      config: {},
    });

    // Two overlapping inputs — NOT awaited, mirroring real Node-RED, which
    // delivers msg B before msg A's handler (and its done()) has finished.
    const a = node.receive({ id: "A", payload: "a" });
    const b = node.receive({ id: "B", payload: "b" });

    // Both inputs have entered input() and parked at the gate; by now the
    // instance field #currentInputMsg has been overwritten to B.
    await vi.waitFor(() => expect(started).toEqual(["A", "B"]));

    release();
    await Promise.all([a, b]);

    const first = node.sent()[0][0] as {
      id: string;
      output: { echoedId: string };
    };
    const second = node.sent()[1][0] as {
      id: string;
      output: { echoedId: string };
    };

    // A resumes first. Both its value AND its carried context are A's, even
    // though B overwrote the shared instance field while A was awaiting —
    // because the context is scoped to A's invocation. (Pre-fix this was "B".)
    expect(first.output.echoedId).toBe("A");
    expect(first.id).toBe("A");

    // B is likewise internally consistent.
    expect(second.output.echoedId).toBe("B");
    expect(second.id).toBe("B");
  });

  it("CONTROL: sequential (awaited) inputs never cross — isolates the cause to overlap", async () => {
    // With each input fully drained before the next (gate already open), there
    // is no overlap, so context would be correct even without per-call scoping.
    const started: string[] = [];
    const { node } = await createNode(
      gatedRacyNode(started, Promise.resolve()),
      { config: {} },
    );

    await node.receive({ id: "A", payload: "a" });
    await node.receive({ id: "B", payload: "b" });

    const first = node.sent()[0][0] as {
      id: string;
      output: { echoedId: string };
    };
    const second = node.sent()[1][0] as {
      id: string;
      output: { echoedId: string };
    };

    expect(first.id).toBe("A");
    expect(first.output.echoedId).toBe("A");
    expect(second.id).toBe("B");
    expect(second.output.echoedId).toBe("B");
  });
});
