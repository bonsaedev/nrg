import { describe, it, expect } from "vitest";
import {
  enabledBuiltins,
  baseOutputCount,
  mapSourcePort,
  shouldCheck,
  wireId,
  moduleOf,
  buildRequest,
  summarize,
  uncheckableMessage,
} from "@/sdk/lib/client/wire-check/plan";
import type {
  NodeLike,
  EditorLink,
  WireCheckResult,
} from "@/sdk/lib/client/wire-check/plan";

const node = (over: Partial<NodeLike> = {}): NodeLike => ({
  id: "n1",
  type: "t",
  outputs: 1,
  ...over,
});

const always = () => true;
const never = () => false;

describe("wire-check plan — port mapping", () => {
  it("maps base ports before enabled built-ins in error→complete→status order", () => {
    // 2 base outputs + error + status enabled (no complete) → ports 0,1 base;
    // 2 = error, 3 = status.
    const n = node({ outputs: 4, errorPort: true, statusPort: true });
    expect(baseOutputCount(n)).toBe(2);
    expect(enabledBuiltins(n)).toEqual(["error", "status"]);
    expect(mapSourcePort(n, 0)).toEqual({ kind: "base", index: 0 });
    expect(mapSourcePort(n, 1)).toEqual({ kind: "base", index: 1 });
    expect(mapSourcePort(n, 2)).toEqual({ kind: "error" });
    expect(mapSourcePort(n, 3)).toEqual({ kind: "status" });
    expect(mapSourcePort(n, 4)).toBeNull(); // out of range
  });

  it("places complete between error and status when all three are on", () => {
    const n = node({
      outputs: 4,
      errorPort: true,
      completePort: true,
      statusPort: true,
    });
    expect(baseOutputCount(n)).toBe(1);
    expect(mapSourcePort(n, 1)).toEqual({ kind: "error" });
    expect(mapSourcePort(n, 2)).toEqual({ kind: "complete" });
    expect(mapSourcePort(n, 3)).toEqual({ kind: "status" });
  });

  it("coerces a string output count (editor stores it as a string)", () => {
    expect(baseOutputCount(node({ outputs: "3" }))).toBe(3);
  });
});

describe("wire-check plan — OR gate", () => {
  const base0 = { kind: "base", index: 0 } as const;

  it("checks when the target opted into input validation", () => {
    expect(shouldCheck(node(), node({ validateInputTypes: true }), base0)).toBe(
      true,
    );
  });

  it("checks when the source opted into that port's output validation", () => {
    expect(
      shouldCheck(node({ validateOutputTypes: { 0: true } }), node(), base0),
    ).toBe(true);
  });

  it("does not check when neither boundary opted in", () => {
    expect(
      shouldCheck(node({ validateOutputTypes: { 1: true } }), node(), base0),
    ).toBe(false);
  });

  it("gates a built-in source port on the target flag alone", () => {
    expect(shouldCheck(node(), node(), { kind: "complete" })).toBe(false);
    expect(
      shouldCheck(node(), node({ validateInputTypes: true }), {
        kind: "complete",
      }),
    ).toBe(true);
  });
});

describe("wire-check plan — request building", () => {
  const link = (over: Partial<EditorLink> = {}): EditorLink => ({
    source: node({ id: "s", type: "src", validateOutputTypes: { 0: true } }),
    sourcePort: 0,
    target: node({ id: "t", type: "tgt" }),
    ...over,
  });

  it("returns null when the wire is not gated in", () => {
    expect(
      buildRequest(link({ source: node({ id: "s", type: "src" }) }), always),
    ).toBeNull();
  });

  it("returns null for an out-of-range source port", () => {
    expect(buildRequest(link({ sourcePort: 9 }), always)).toBeNull();
  });

  it("builds a base-port request with wrap config + wire id", () => {
    const req = buildRequest(
      link({
        source: node({
          id: "s",
          type: "src",
          validateOutputTypes: { 0: true },
          outputReturnProperties: { 0: "result" },
          outputContextModes: { 0: "trace" },
          _def: { set: { module: "pkg-a" } },
        }),
      }),
      always,
    );
    expect(req).toEqual({
      id: "s:0:t",
      source: {
        type: "src",
        module: "pkg-a",
        port: { kind: "base", index: 0, returnKey: "result", mode: "trace" },
      },
      target: { type: "tgt", module: undefined },
    });
  });

  it("omits the module for a non-nrg endpoint", () => {
    const req = buildRequest(
      link({
        source: node({
          id: "s",
          type: "src",
          validateOutputTypes: { 0: true },
          _def: { set: { module: "pkg-a" } },
        }),
      }),
      never, // nothing is an nrg type
    );
    expect(req?.source.module).toBeUndefined();
  });

  it("builds a built-in complete-port request gated by the target", () => {
    const req = buildRequest(
      link({
        source: node({ id: "s", type: "src", outputs: 2, completePort: true }),
        sourcePort: 1, // 1 base + complete → port 1 is complete
        target: node({ id: "t", type: "tgt", validateInputTypes: true }),
      }),
      always,
    );
    expect(req?.source.port).toEqual({ kind: "complete" });
    expect(req?.id).toBe("s:1:t");
  });
});

describe("wire-check plan — summaries", () => {
  const r = (over: Partial<WireCheckResult>): WireCheckResult => ({
    id: "w",
    ok: true,
    checked: true,
    ...over,
  });

  it("returns null when everything passed and nothing was skipped", () => {
    expect(summarize([r({}), r({ id: "x" })])).toBeNull();
  });

  it("reports failures as an error summary", () => {
    const s = summarize([
      r({ id: "a", ok: false, message: "Property 'x' is missing" }),
      r({ id: "b" }),
    ]);
    expect(s?.level).toBe("error");
    expect(s?.text).toContain("a: Property 'x' is missing");
  });

  it("reports only-unchecked as a warning with the verbatim wording", () => {
    const s = summarize([
      r({
        id: "w1",
        checked: false,
        reason: 'the source node "inject" is not an nrg node',
      }),
    ]);
    expect(s?.level).toBe("warning");
    expect(s?.text).toContain(
      'Type Validation for wire w1 couldn\'t be done because the source node "inject" is not an nrg node',
    );
  });

  it("wireId / uncheckableMessage format as documented", () => {
    expect(
      wireId({
        source: node({ id: "a" }),
        sourcePort: 2,
        target: node({ id: "b" }),
      }),
    ).toBe("a:2:b");
    expect(
      uncheckableMessage(r({ id: "z", checked: false, reason: "no types" })),
    ).toBe("Type Validation for wire z couldn't be done because no types");
    expect(
      moduleOf(node({ type: "x", _def: { set: { module: "m" } } }), always),
    ).toBe("m");
  });
});
