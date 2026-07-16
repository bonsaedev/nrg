import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import { createNode } from "@/sdk/test/server/unit";
import { Channels } from "@/sdk/lib/server";
import ConstNode from "../fixtures/message-model/const-node";
import Echo from "../fixtures/message-model/echo";
import ChannelEcho from "../fixtures/message-model/channel-echo";
import Completer from "../fixtures/message-model/completer";
import Thrower from "../fixtures/message-model/thrower";

// A data-port `source` (produced by `#outputSource`): node identity + the port
// index and, for a named-port node, the port name.
const src = (port: number, portName: string) => ({
  id: expect.any(String),
  type: expect.any(String),
  name: expect.any(String),
  port,
  portName,
});

// A built-in-port `source` (produced by `#nodeSource`): node identity only — the
// complete/error auto-emits carry no port index.
const nodeSrc = () => ({
  id: expect.any(String),
  type: expect.any(String),
  name: expect.any(String),
});

// The fixture nodes are TYPES-ONLY; point the topology extractor at their tree so
// createNode stamps real ports (named "out" + the built-in error/complete slots).
const FIXTURE_DIR = fileURLToPath(
  new URL("../fixtures/message-model", import.meta.url),
);

let prevSrc: string | undefined;

beforeAll(() => {
  prevSrc = process.env.NRG_SERVER_SRC;
  process.env.NRG_SERVER_SRC = FIXTURE_DIR;
});

afterAll(() => {
  if (prevSrc === undefined) delete process.env.NRG_SERVER_SRC;
  else process.env.NRG_SERVER_SRC = prevSrc;
});

describe("message model — outgoing shape", () => {
  it("passthrough (default) puts the result at the return key, source at the root, incoming under input", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ topic: "t" });

    expect(node.sent(0)[0]).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { topic: "t" },
    });
  });

  it("source rides the ROOT (msg.source) — never inside the port's value", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ topic: "t" });

    const out = node.sent(0)[0] as Record<string, any>;
    // A root key survives Node-RED's fan-out clone; an `_msgid`-keyed off-wire
    // channel would collide across the shared clones — so source stays at root.
    expect(out.source).toEqual(src(0, "out"));
    expect(out.output).toBe("R"); // the value is untouched by provenance
    expect(out.output.source).toBeUndefined();
  });

  it("preserves the incoming _msgid on the outgoing message and its input frame", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ _msgid: "m1", topic: "t" });

    expect(node.sent(0)[0]).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { _msgid: "m1", topic: "t" },
      _msgid: "m1",
    });
  });

  it("reset drops the input frame — only the result + source (still keeps _msgid)", async () => {
    const { node } = await createNode(ConstNode, {
      config: { outputContextModes: { 0: "reset" } },
    });
    await node.receive({ _msgid: "m1", topic: "t", input: { a: 1 } });

    expect(node.sent(0)[0]).toEqual({
      output: "R",
      source: src(0, "out"),
      _msgid: "m1",
    });
  });

  it("passthrough is the fallback when no per-port mode is configured", async () => {
    const { node } = await createNode(ConstNode, {
      // config sets a DIFFERENT port; port 0 falls back to passthrough
      config: { outputContextModes: { 1: "reset" } },
    });
    await node.receive({ topic: "t" });

    expect(node.sent(0)[0]).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { topic: "t" },
    });
  });

  it("rejects a return property of 'input' — it would overwrite the nested frame", async () => {
    // `input` is the framework's own outgoing key (the depth-1 previous message),
    // so a port cannot repurpose it as its return property.
    await expect(
      createNode(ConstNode, {
        config: { outputReturnProperties: { 0: "input" } },
      }),
    ).rejects.toThrow(/Reserved return property "input"/);
  });
});

describe("message model — depth-1 chain (no trace accumulation)", () => {
  it("nests the previous message under input exactly one hop deep across two nrg nodes", async () => {
    // Node A processes a core message and emits its frame.
    const a = await createNode(ConstNode);
    await a.node.receive({ _msgid: "m1", topic: "t" });
    const aOut = a.node.sent(0)[0] as Record<string, any>;
    expect(aOut).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { _msgid: "m1", topic: "t" },
      _msgid: "m1",
    });

    // Node B receives A's whole frame. Its own `input` frame is A's frame MINUS
    // A's `input` — so `input.output` is A's result, and there is NO deeper
    // `input.input`. This is the exact model: output = { input, output, _msgid };
    // the next node's input = { output-of-prev, source, _msgid } (depth-1).
    const b = await createNode(ConstNode);
    await b.node.receive(aOut);
    const bOut = b.node.sent(0)[0] as Record<string, any>;

    expect(bOut).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { output: "R", source: src(0, "out"), _msgid: "m1" },
      _msgid: "m1",
    });
    // the nested frame carries no `input` of its own — the chain never grows
    expect("input" in (bOut.input as Record<string, unknown>)).toBe(false);
  });

  it("passthrough strips the incoming message's own history frame", async () => {
    const { node } = await createNode(ConstNode);
    await node.receive({ topic: "z", input: { output: "upstream" } });

    expect(node.sent(0)[0]).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { topic: "z" }, // upstream's own `input` was stripped
    });
  });

  it("bounds the input chain to one level across many hops (loop-safe)", async () => {
    const { node } = await createNode(ConstNode);
    let msg: Record<string, unknown> = { topic: "tick" };
    for (let i = 0; i < 5; i++) {
      await node.receive(msg);
      msg = node.sent(0).at(-1)! as Record<string, any>;
    }

    expect(msg).toEqual({
      output: "R",
      source: src(0, "out"),
      input: { output: "R", source: src(0, "out") },
    });
    expect("input" in (msg.input as object)).toBe(false);
  });
});

describe("message model — input root rebase", () => {
  it("defaults to the whole message (empty inputRoot is a no-op)", async () => {
    const { node } = await createNode(Echo);
    await node.receive({ value: 42, foo: "outside" });

    expect(node.sent(0)[0]).toEqual({
      output: { seen: 42, foo: "outside" },
      source: src(0, "out"),
      input: { value: 42, foo: "outside" },
    });
  });

  it("'.' and 'msg' also mean the whole message", async () => {
    for (const root of [".", "msg"]) {
      const { node } = await createNode(Echo, { config: { inputRoot: root } });
      await node.receive({ value: 1, foo: "f" });
      expect(node.sent(0)[0].output).toEqual({ seen: 1, foo: "f" });
    }
  });

  it("rebases the message to the chosen root so input() reads its fields at the root", async () => {
    const { node } = await createNode(Echo, {
      config: { inputRoot: "output" },
    });
    // The upstream nrg node delivered its result under `output`; this node reads
    // it directly at the root — no `msg.output.` prefix, no Set node needed.
    await node.receive({
      _msgid: "m1",
      output: { value: 42 },
      foo: "outside",
    });

    // `value` came from the root; `foo` (OUTSIDE the chosen root) is gone — the
    // rebase is lossy by design.
    expect(node.sent(0)[0].output).toEqual({ seen: 42, foo: undefined });
    // The outgoing `input` frame is the REBASED message the node actually saw,
    // not the raw incoming — and `_msgid` survived the rebase.
    expect(node.sent(0)[0].input).toEqual({ value: 42, _msgid: "m1" });
    expect(node.sent(0)[0]._msgid).toBe("m1");
  });

  it("a missing / non-object root yields an empty message (only _msgid survives)", async () => {
    const { node } = await createNode(Echo, {
      config: { inputRoot: "output" },
    });
    await node.receive({ _msgid: "m1", foo: "bar" }); // no `output` key

    expect(node.sent(0)[0].output).toEqual({ seen: undefined, foo: undefined });
    expect(node.sent(0)[0].input).toEqual({ _msgid: "m1" });
  });

  it("preserves _msgid so off-the-wire channels survive the rebase", async () => {
    const { node } = await createNode(ChannelEcho, {
      config: { inputRoot: "output" },
    });
    // The channel store is keyed by _msgid; the rebase carries _msgid across, so
    // the private channel still resolves after the message is rebuilt.
    await node.receive(
      { _msgid: "m1", output: { value: 42 } },
      { private: { secret: 7 } },
    );

    expect(node.sent(0)[0].output).toEqual({ value: 42, secret: 7 });
  });
});

describe("message model — built-in port input frames", () => {
  it("complete port carries source + the processed input at the root, value in its block", async () => {
    const { node } = await createNode(Completer, {
      config: { completePort: true },
    });
    await node.receive({ _msgid: "m1", value: 42 });

    // complete port index = baseOutputs(1) + errorPort(0) = 1
    const complete = node.sent(1)[0] as Record<string, any>;
    expect(complete).toEqual({
      complete: { done: 42 },
      source: nodeSrc(),
      input: { _msgid: "m1", value: 42 },
      _msgid: "m1",
    });
  });

  it("complete port's input frame reflects the REBASED message under inputRoot", async () => {
    const { node } = await createNode(Completer, {
      config: { completePort: true, inputRoot: "output" },
    });
    await node.receive({ _msgid: "m1", output: { value: 42 } });

    const complete = node.sent(1)[0] as Record<string, any>;
    // the value came from the rebased root; the `input` frame is what the node
    // processed (rebased), matching the data ports — not the raw incoming.
    expect(complete.complete).toEqual({ done: 42 });
    expect(complete.input).toEqual({ value: 42, _msgid: "m1" });
    expect(complete._msgid).toBe("m1");
  });

  it("error port carries source + the processed input at the root, error in its block", async () => {
    const { node } = await createNode(Thrower, {
      config: { errorPort: true },
    });
    await node.receive({ _msgid: "m1", value: 42 });

    // error port index = baseOutputs(1) = 1
    const errored = node.sent(1)[0] as Record<string, any>;
    expect(errored.error).toMatchObject({ name: "Error", message: "boom" });
    expect(errored.error.source).toBeUndefined(); // source is NOT inside `error`
    expect(errored.source).toEqual(nodeSrc()); // it rides the root
    expect(errored.input).toEqual({ _msgid: "m1", value: 42 });
    expect(errored._msgid).toBe("m1");
  });

  it("error port's input frame reflects the REBASED message under inputRoot", async () => {
    const { node } = await createNode(Thrower, {
      config: { errorPort: true, inputRoot: "output" },
    });
    await node.receive({ _msgid: "m1", output: { value: 42 } });

    const errored = node.sent(1)[0] as Record<string, any>;
    expect(errored.input).toEqual({ value: 42, _msgid: "m1" });
    expect(errored._msgid).toBe("m1");
  });
});
