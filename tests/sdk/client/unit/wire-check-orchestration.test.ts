import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

// Drives the editor wire-check orchestration (wire-check/index.ts) with a mocked
// RED + mocked transport: a mismatch verdict on links:add destructively removes
// the wire and toasts; a passing verdict stays silent; the plugin's post-deploy
// flow report arrives over RED.comms and raises exactly one notification. The
// pure planner and the report helpers are covered elsewhere — this is the glue.

const checkWire = vi.fn();
const checkWires = vi.fn();
vi.mock("@/sdk/lib/client/wire-check/transport", () => ({
  checkWire,
  checkWires,
  fetchStatus: vi.fn(async () => ({ available: true })),
}));

interface RedMock {
  events: {
    on: (e: string, cb: (...a: any[]) => void) => void;
    emit: (e: string, ...a: any[]) => void;
  };
  nodes: {
    removeLink: ReturnType<typeof vi.fn>;
    eachLink: ReturnType<typeof vi.fn>;
  };
  view: { redraw: ReturnType<typeof vi.fn> };
  notify: ReturnType<typeof vi.fn>;
  comms: {
    subscribe: (t: string, cb: (t: string, d: unknown) => void) => void;
  };
}

let RED: RedMock;
const commsSubs: Record<string, ((t: string, d: unknown) => void)[]> = {};
const emit = (e: string, ...a: any[]) => RED.events.emit(e, ...a);
/** Push a plugin deploy report to the editor, as RED.comms would deliver it. */
const pushReport = (data: unknown) =>
  (commsSubs["nrg/type-check"] ?? []).forEach((cb) =>
    cb("nrg/type-check", data),
  );
const reportWire = (id: string, ok: boolean) => ({
  id,
  label: id,
  ok,
  ...(ok ? {} : { message: "type mismatch" }),
});
const flowReport = (wires: ReturnType<typeof reportWire>[]) => ({
  ok: wires.every((w) => w.ok),
  wires,
  uncheckedTypes: [],
  unattributed: [],
  checkedAt: "now",
});

const link = (over: Record<string, unknown> = {}) => ({
  source: {
    id: "s",
    type: "src",
    outputs: 1,
    validateOutputTypes: { 0: true },
    _def: { set: { module: "pkg" } },
  },
  sourcePort: 0,
  target: {
    id: "t",
    type: "tgt",
    validateInputTypes: true,
    _def: { set: { module: "pkg" } },
  },
  ...over,
});

/** Fire a single interactive links:add and let the microtask flush + verdict settle. */
async function drawWire(l: unknown): Promise<void> {
  emit("links:add", l);
  await vi.waitFor(() => expect(checkWire).toHaveBeenCalled(), {
    timeout: 1000,
  });
}

describe("wire-check editor orchestration", () => {
  beforeAll(async () => {
    const listeners: Record<string, ((...a: any[]) => void)[]> = {};
    RED = {
      events: {
        on: (e, cb) => (listeners[e] ??= []).push(cb),
        emit: (e, ...a) => (listeners[e] ?? []).forEach((cb) => cb(...a)),
      },
      nodes: { removeLink: vi.fn(), eachLink: vi.fn() },
      view: { redraw: vi.fn() },
      notify: vi.fn(),
      comms: {
        subscribe: (t, cb) => (commsSubs[t] ??= []).push(cb),
      },
    };
    (globalThis as { RED?: unknown }).RED = RED;

    // registry: mark our fixture types as nrg-owned so a module is sent.
    const { registerNrgType } =
      await import("@/sdk/lib/client/wire-check/registry");
    registerNrgType("src");
    registerNrgType("tgt");

    // side-effect import installs the event hooks against globalThis.RED.
    await import("@/sdk/lib/client/wire-check");

    // plugin is available + initial load complete → interactive adds act.
    const { typeCheckEnabled } =
      await import("@/sdk/lib/client/wire-check/availability");
    typeCheckEnabled.value = true;
    emit("flows:load");
  });

  beforeEach(() => {
    checkWire.mockReset();
    checkWires.mockReset();
    RED.nodes.removeLink.mockReset();
    RED.nodes.eachLink.mockReset();
    RED.notify.mockReset();
  });

  it("destructively removes a wire whose verdict is a real mismatch, and toasts", async () => {
    checkWire.mockResolvedValueOnce({
      id: "s:0:t",
      ok: false,
      checked: true,
      message: "Property 'marker' is missing",
    });
    const l = link();
    await drawWire(l);

    await vi.waitFor(() =>
      expect(RED.nodes.removeLink).toHaveBeenCalledWith(l),
    );
    expect(RED.notify).toHaveBeenCalledWith(
      expect.stringContaining("Wire type mismatch"),
      expect.objectContaining({ type: "error" }),
    );
  });

  it("leaves a passing wire alone (no removal, no toast)", async () => {
    checkWire.mockResolvedValueOnce({ id: "s:0:t", ok: true, checked: true });
    await drawWire(link());

    // let any (unexpected) follow-up settle
    await new Promise((r) => setTimeout(r, 20));
    expect(RED.nodes.removeLink).not.toHaveBeenCalled();
    expect(RED.notify).not.toHaveBeenCalled();
  });

  it("stays silent when a wire couldn't be checked (untyped/unavailable)", async () => {
    checkWire.mockResolvedValueOnce({
      id: "s:0:t",
      ok: true,
      checked: false,
      reason: 'the source node "src" does not declare a typed output',
    });
    await drawWire(link());

    await new Promise((r) => setTimeout(r, 20));
    expect(RED.nodes.removeLink).not.toHaveBeenCalled();
    expect(RED.notify).not.toHaveBeenCalled();
  });

  it("ignores an import burst (multiple links added in one tick)", async () => {
    emit("links:add", link());
    emit(
      "links:add",
      link({
        target: {
          id: "t2",
          type: "tgt",
          validateInputTypes: true,
          _def: { set: { module: "pkg" } },
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(checkWire).not.toHaveBeenCalled(); // burst → treated as import, skipped
  });

  it("drops the verdict for a wire deleted mid-check (no removal, no toast)", async () => {
    // hold the check in flight so links:remove lands before it resolves
    let settle!: (r: unknown) => void;
    checkWire.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const l = link();
    emit("links:add", l);
    await vi.waitFor(() => expect(checkWire).toHaveBeenCalled());

    // author deletes the wire before the verdict lands → cancel it
    emit("links:remove", l);

    // the (mismatch) verdict now arrives and must be discarded
    settle({
      id: "s:0:t",
      ok: false,
      checked: true,
      message: "Property 'marker' is missing",
    });
    await new Promise((r) => setTimeout(r, 20));

    expect(RED.nodes.removeLink).not.toHaveBeenCalled();
    expect(RED.notify).not.toHaveBeenCalled();
  });

  it("an all-green deploy report is silent (no prior failures)", () => {
    pushReport(flowReport([reportWire("s:0:t", true)]));
    expect(RED.notify).not.toHaveBeenCalled();
  });

  it("a deploy report with failures raises ONE sticky error notification", () => {
    pushReport(
      flowReport([reportWire("s:0:t", true), reportWire("s:0:t2", false)]),
    );

    expect(RED.notify).toHaveBeenCalledTimes(1);
    const [text, opts] = RED.notify.mock.calls[0];
    expect(text).toContain("1 wire(s) failed");
    expect(text).toContain("s:0:t2");
    expect(opts).toMatchObject({ type: "error", timeout: 0 });
  });

  it("green AFTER failures toasts a brief success", () => {
    pushReport(flowReport([reportWire("s:0:t", false)]));
    RED.notify.mockReset();

    pushReport(flowReport([reportWire("s:0:t", true)]));
    expect(RED.notify).toHaveBeenCalledTimes(1);
    const [text, opts] = RED.notify.mock.calls[0];
    expect(text).toContain("green");
    expect(opts).toMatchObject({ type: "success" });
  });

  it("a malformed comms payload is ignored (fails open)", () => {
    pushReport({ nonsense: true });
    pushReport(null);
    expect(RED.notify).not.toHaveBeenCalled();
  });
});
