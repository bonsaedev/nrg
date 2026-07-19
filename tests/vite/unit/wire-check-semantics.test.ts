import path from "node:path";
import { describe, it, expect } from "vitest";
import { checkFlowConfig } from "@/tools/vite/server/wire-check/flow-check";
import type {
  FlowNode,
  Registry,
} from "@/tools/vite/server/wire-check/compile";

// TDD behavioral spec for the flow wire-check under the accumulating-record model.
// Each test states an EXPECTED semantic and drives it through the real compiler +
// in-memory tsc. A red test is a real bug; a green test pins the contract.

const tab: FlowNode = { id: "t", type: "tab" };
const n = (
  id: string,
  type: string,
  wires: string[][],
  extra: Partial<FlowNode> = {},
): FlowNode => ({ id, type, z: "t", name: id, wires, ...extra });

/** ids of the failing wires. */
const failed = (flow: FlowNode[], reg: Registry, decl = ""): string[] =>
  checkFlowConfig(flow, reg, decl)
    .wires.filter((w) => !w.ok)
    .map((w) => w.id);

describe("wire-check semantics (TDD)", () => {
  // ── accumulation ────────────────────────────────────────────────────────
  it("carries a field three hops so a late reader sees an early producer's field", () => {
    const reg: Registry = {
      a: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ a: number }" }],
      },
      b: {
        reads: "{ a: number }",
        ports: [{ name: "o", adds: "{ b: number }" }],
      },
      c: { reads: "{ a: number; b: number }", ports: [] }, // reads BOTH
    };
    const flow = [
      tab,
      n("na", "a", [["nb"]]),
      n("nb", "b", [["nc"]]),
      n("nc", "c", []),
    ];
    expect(failed(flow, reg)).toEqual([]);
  });

  it("reds the reader's wire when a required field is produced by nobody", () => {
    const reg: Registry = {
      a: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ a: number }" }],
      },
      c: { reads: "{ a: number; b: number }", ports: [] }, // b missing
    };
    expect(
      failed([tab, n("na", "a", [["nc"]]), n("nc", "c", [])], reg),
    ).toEqual(["na:0:nc"]);
  });

  // ── last-writer-wins (the soundness fix) ─────────────────────────────────
  it("overwriting a key adopts the NEW type (last-writer-wins), not an intersection", () => {
    // `w` reads { x: number } and re-adds { x: string }. Runtime spread makes the
    // outgoing x a STRING. A downstream reader wanting string is GREEN; one
    // wanting number is RED. (A plain `In & Adds` would type x as `never` and
    // wrongly pass BOTH.)
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ x: number }" }],
      },
      w: {
        reads: "{ x: number }",
        ports: [{ name: "o", adds: "{ x: string }" }],
      },
      wantStr: { reads: "{ x: string }", ports: [] },
      wantNum: { reads: "{ x: number }", ports: [] },
    };
    const okFlow = [
      tab,
      n("s", "src", [["w"]]),
      n("w", "w", [["r"]]),
      n("r", "wantStr", []),
    ];
    expect(failed(okFlow, reg)).toEqual([]);
    const badFlow = [
      tab,
      n("s", "src", [["w"]]),
      n("w", "w", [["r"]]),
      n("r", "wantNum", []),
    ];
    expect(failed(badFlow, reg)).toEqual(["w:0:r"]);
  });

  // ── built-in lifecycle ports MERGE the record ────────────────────────────
  const lifeReg: Registry = {
    src: {
      source: true,
      reads: "object",
      ports: [{ name: "o", adds: "{ order: number }" }],
    },
    proc: {
      reads: "{ order: number }",
      ports: [{ name: "out", adds: "{ y: number }" }],
      complete: "{ done: boolean }",
    },
    // readers of a lifecycle wire that need a CARRIED field + the lifecycle add
    readErr: {
      reads: "{ order: number; error: { message: string } }",
      ports: [],
    },
    readStatus: { reads: "{ order: number; status: unknown }", ports: [] },
    readComplete: { reads: "{ order: number; done: boolean }", ports: [] },
    readMissing: { reads: "{ nope: boolean }", ports: [] },
  };

  it("error port carries the record AND adds { error } (carried-field reader GREEN)", () => {
    // wires: [0]=data out, [1]=error
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["e"]], { errorPort: true }),
      n("e", "readErr", []),
    ];
    expect(failed(flow, lifeReg)).toEqual([]);
  });

  it("status port carries the record AND adds { status }", () => {
    // wires: [0]=data, [1]=status (error/complete NOT enabled → status is slot 1)
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["st"]], { statusPort: true }),
      n("st", "readStatus", []),
    ];
    expect(failed(flow, lifeReg)).toEqual([]);
  });

  it("complete port carries the record AND input()'s returned fields", () => {
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["c"]], { completePort: true }),
      n("c", "readComplete", []),
    ];
    expect(failed(flow, lifeReg)).toEqual([]);
  });

  it("a lifecycle wire still REDS when the reader needs a field nobody produced", () => {
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["bad"]], { errorPort: true }),
      n("bad", "readMissing", []),
    ];
    expect(failed(flow, lifeReg)).toEqual(["p:1:bad"]);
  });

  it("the built-in port slot order is error → complete → status", () => {
    // enable ALL three; wires[1]=error, [2]=complete, [3]=status. Wire each to the
    // matching reader — every wire GREEN proves the slot mapping.
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["e"], ["c"], ["st"]], {
        errorPort: true,
        completePort: true,
        statusPort: true,
      }),
      n("e", "readErr", []),
      n("c", "readComplete", []),
      n("st", "readStatus", []),
    ];
    expect(failed(flow, lifeReg)).toEqual([]);
  });

  // ── fan-in attribution ───────────────────────────────────────────────────
  const fanReg: Registry = {
    good: {
      source: true,
      reads: "object",
      ports: [{ name: "o", adds: "{ k: number }" }],
    },
    bad: {
      source: true,
      reads: "object",
      ports: [{ name: "o", adds: "{ other: string }" }],
    },
    join: { reads: "{ k: number }", ports: [] },
  };

  it("fan-in reds only the culprit wire", () => {
    const flow = [
      tab,
      n("a", "good", [["j"]]),
      n("b", "bad", [["j"]]),
      n("j", "join", []),
    ];
    expect(failed(flow, fanReg)).toEqual(["b:0:j"]);
  });

  it("fan-in reds BOTH wires when both sources are incompatible", () => {
    const flow = [
      tab,
      n("a", "bad", [["j"]]),
      n("b", "bad", [["j"]]),
      n("j", "join", []),
    ];
    expect(failed(flow, fanReg).sort()).toEqual(["a:0:j", "b:0:j"]);
  });

  it("fan-in is all-green when every source satisfies the join", () => {
    const flow = [
      tab,
      n("a", "good", [["j"]]),
      n("b", "good", [["j"]]),
      n("j", "join", []),
    ];
    expect(failed(flow, fanReg)).toEqual([]);
  });

  it("a fan-in that catches a bad source stays CLEAN (no spurious internalError)", () => {
    // Regression: the fan-in join's merged-input line must NOT leak an
    // unattributed diagnostic when one source is incompatible. The wire verdict is
    // attributed to the culprit; the check itself is not an internal fault.
    const flow = [
      tab,
      n("a", "good", [["j"]]),
      n("b", "bad", [["j"]]),
      n("j", "join", []),
    ];
    const report = checkFlowConfig(flow, fanReg);
    expect(report.wires.filter((w) => !w.ok).map((w) => w.id)).toEqual([
      "b:0:j",
    ]);
    expect(report.internalError).toBe(false);
    expect(report.unattributed).toEqual([]);
  });

  it("a fan-in WITH an output port carries the fields common to all sources", () => {
    // Two sources each add { id; extra }; the merge node reads { id } and adds
    // { merged }. Its output must carry the COMMON fields (id, extra) + merged, so
    // a downstream reader of { id; merged } is GREEN — exercises the declare-const
    // merge-type path (not the port function) for fan-in outputs.
    const reg: Registry = {
      srcId: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ id: string; extra: number }" }],
      },
      merge: {
        reads: "{ id: string }",
        ports: [{ name: "o", adds: "{ merged: boolean }" }],
      },
      readMerged: { reads: "{ id: string; merged: boolean }", ports: [] },
    };
    const flow = [
      tab,
      n("a", "srcId", [["m"]]),
      n("b", "srcId", [["m"]]),
      n("m", "merge", [["r"]]),
      n("r", "readMerged", []),
    ];
    const report = checkFlowConfig(flow, reg);
    expect(report.wires.filter((w) => !w.ok)).toEqual([]);
    expect(report.internalError).toBe(false);
  });

  // ── edge cases likely to hide bugs ────────────────────────────────────────
  it("a self-loop is typed via the loop invariant (declared reads), not circular", () => {
    // `loop` reads { n: number } and re-emits { n: number }; wire it to itself.
    const reg: Registry = {
      start: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ n: number }" }],
      },
      loop: {
        reads: "{ n: number }",
        ports: [{ name: "o", adds: "{ n: number }" }],
      },
    };
    const flow = [
      tab,
      n("s", "start", [["l"]]),
      n("l", "loop", [["l"]]), // self back-edge
    ];
    const report = checkFlowConfig(flow, reg);
    // it must not throw / hang, and the back-edge is checked against the invariant
    expect(report.wires.some((w) => w.id === "l:0:l")).toBe(true);
    expect(report.ok).toBe(true);
  });

  it("two instances of one type with DIFFERENT built-in wiring each resolve independently", () => {
    // instance A wires its error port; instance B does not. Both must be fine.
    const flow = [
      tab,
      n("s1", "src", [["p1"]]),
      n("p1", "proc", [[], ["e"]], { errorPort: true }),
      n("e", "readErr", []),
      n("s2", "src", [["p2"]]),
      n("p2", "proc", [["d"]], { errorPort: true }), // enabled but data-only wired
      n("d", "readComplete", []), // reads { order, done } — p2 out adds { y }, no done → RED
    ];
    // p2's data `out` adds { y } (not done) → the d wire is the only red one;
    // p1's error wire is green.
    expect(failed(flow, lifeReg)).toEqual(["p2:0:d"]);
  });

  it("a named output port other than the first is addressed correctly", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ x: number }" }],
      },
      split: {
        reads: "{ x: number }",
        ports: [
          { name: "left", adds: "{ l: number }" },
          { name: "right", adds: "{ r: string }" },
        ],
      },
      wantR: { reads: "{ r: string }", ports: [] },
      wantWrongR: { reads: "{ r: number }", ports: [] },
    };
    // wire port index 1 (right) → reader; index 0 (left) unwired
    const ok = [
      tab,
      n("s", "src", [["sp"]]),
      n("sp", "split", [[], ["w"]]),
      n("w", "wantR", []),
    ];
    expect(failed(ok, reg)).toEqual([]);
    const bad = [
      tab,
      n("s", "src", [["sp"]]),
      n("sp", "split", [[], ["w"]]),
      n("w", "wantWrongR", []),
    ];
    expect(failed(bad, reg)).toEqual(["sp:1:w"]);
  });

  it("an unattributed diagnostic (garbled extracted type) never reds a valid flow", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ x: number }" }],
      },
      // `reads` references an undeclared name → error lands on a non-wire decl line
      bad: { reads: "DoesNotExist", ports: [] },
    };
    const report = checkFlowConfig(
      [tab, n("s", "src", [["b"]]), n("b", "bad", [])],
      reg,
    );
    expect(report.ok).toBe(true); // wiring verdict stands
    expect(report.internalError).toBe(true); // but flagged as not-clean
  });

  // ── adversarial edge cases ────────────────────────────────────────────────
  it("a back-edge that VIOLATES the loop invariant is caught RED", () => {
    // loop join `j` reads { n: number }; a downstream node re-types n to string and
    // wires BACK into `j`. The back-edge must fail the invariant (n: number).
    const reg: Registry = {
      start: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ n: number }" }],
      },
      j: {
        reads: "{ n: number }",
        ports: [{ name: "o", adds: "{ step: number }" }],
      },
      retype: {
        reads: "{ n: number }",
        ports: [{ name: "o", adds: "{ n: string }" }],
      },
    };
    const flow = [
      tab,
      n("s", "start", [["j"]]),
      n("j", "j", [["r"]]),
      n("r", "retype", [["j"]]), // back-edge carries { n: string } → violates { n: number }
    ];
    const report = checkFlowConfig(flow, reg);
    expect(report.wires.filter((w) => !w.ok).map((w) => w.id)).toContain(
      "r:0:j",
    );
  });

  it("an `any`-input node CARRIES a typed upstream's fields (re-anchors only after a core boundary)", () => {
    // `passthru` reads `any` (accepts anything) and adds { tag: string }. Fed by a
    // TYPED source producing { payload: number }, its output must carry payload.
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ payload: number }" }],
      },
      passthru: {
        reads: "any",
        ports: [{ name: "o", adds: "{ tag: string }" }],
      },
      wantPayload: { reads: "{ payload: number; tag: string }", ports: [] },
    };
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "passthru", [["r"]]),
      n("r", "wantPayload", []),
    ];
    expect(failed(flow, reg)).toEqual([]);
  });

  it("a complete port with a VOID input() return forwards the record (no added fields)", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ order: number }" }],
      },
      // no `complete` role → void return
      proc: {
        reads: "{ order: number }",
        ports: [{ name: "out", adds: "{ y: number }" }],
      },
      wantOrder: { reads: "{ order: number }", ports: [] },
      wantReturn: { reads: "{ result: number }", ports: [] },
    };
    // complete carries { order } (the record) but adds NOTHING
    const ok = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["c"]], { completePort: true }),
      n("c", "wantOrder", []),
    ];
    expect(failed(ok, reg)).toEqual([]);
    const bad = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "proc", [[], ["c"]], { completePort: true }),
      n("c", "wantReturn", []), // no `result` on a void-complete frame
    ];
    expect(failed(bad, reg)).toEqual(["p:1:c"]);
  });

  it("an optional input field accepts a source that omits it, but reds a wrong type", () => {
    const reg: Registry = {
      other: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ topic: string }" }],
      },
      badPayload: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ payload: number }" }],
      },
      reader: { reads: "{ payload?: string }", ports: [] },
    };
    // a source with no `payload` satisfies { payload?: string }
    expect(
      failed([tab, n("a", "other", [["r"]]), n("r", "reader", [])], reg),
    ).toEqual([]);
    // a source with payload: number does NOT
    expect(
      failed([tab, n("a", "badPayload", [["r"]]), n("r", "reader", [])], reg),
    ).toEqual(["a:0:r"]);
  });

  it("a REQUIRED reader field fed by an OPTIONAL source field is RED (could be undefined)", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ payload?: string }" }],
      },
      want: { reads: "{ payload: string }", ports: [] }, // required
    };
    expect(
      failed([tab, n("s", "src", [["r"]]), n("r", "want", [])], reg),
    ).toEqual(["s:0:r"]);
  });

  it("a nested field type mismatch is caught, with the nested path in the message", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ obj: { x: string } }" }],
      },
      want: { reads: "{ obj: { x: number } }", ports: [] },
    };
    const report = checkFlowConfig(
      [tab, n("s", "src", [["r"]]), n("r", "want", [])],
      reg,
    );
    const bad = report.wires.find((w) => w.id === "s:0:r");
    expect(bad?.ok).toBe(false);
    expect(bad?.message).toMatch(/x/);
  });

  it("a reader with an index signature accepts any record (untyped input tolerates all)", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ whatever: number }" }],
      },
      loose: { reads: "Record<string, unknown>", ports: [] },
    };
    expect(
      failed([tab, n("s", "src", [["r"]]), n("r", "loose", [])], reg),
    ).toEqual([]);
  });

  it("a port with empty additions forwards the record unchanged", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ a: number }" }],
      },
      passthru: { reads: "{ a: number }", ports: [{ name: "o", adds: "{}" }] },
      want: { reads: "{ a: number }", ports: [] },
    };
    const flow = [
      tab,
      n("s", "src", [["p"]]),
      n("p", "passthru", [["r"]]),
      n("r", "want", []),
    ];
    expect(failed(flow, reg)).toEqual([]);
  });

  it("a Port<unknown> (untyped) output is accepted by any reader — an untyped boundary", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "unknown" }],
      },
      want: { reads: "{ payload: string }", ports: [] },
    };
    // an untyped output can't be verified against a typed input — must not RED
    const report = checkFlowConfig(
      [tab, n("s", "src", [["r"]]), n("r", "want", [])],
      reg,
    );
    expect(report.wires.find((w) => w.id === "s:0:r")?.ok).toBe(true);
  });

  // ── fan-OUT: one port to many readers, attributed independently ───────────
  it("fan-out reds only the incompatible reader, leaving the compatible one green", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ k: number }" }],
      },
      wantK: { reads: "{ k: number }", ports: [] },
      wantMissing: { reads: "{ z: number }", ports: [] },
    };
    // one output port → TWO readers (fan-out on a single port)
    const flow = [
      tab,
      n("s", "src", [["ok", "bad"]]),
      n("ok", "wantK", []),
      n("bad", "wantMissing", []),
    ];
    expect(failed(flow, reg)).toEqual(["s:0:bad"]);
  });

  // ── diamond: a field reaches a join along TWO paths from one origin ────────
  it("a diamond carries the origin field down both arms to the join", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ origin: number }" }],
      },
      left: {
        reads: "{ origin: number }",
        ports: [{ name: "o", adds: "{ l: number }" }],
      },
      right: {
        reads: "{ origin: number }",
        ports: [{ name: "o", adds: "{ r: number }" }],
      },
      join: { reads: "{ origin: number }", ports: [] }, // both arms carry origin
    };
    const flow = [
      tab,
      n("s", "src", [["l", "r"]]),
      n("l", "left", [["j"]]),
      n("r", "right", [["j"]]),
      n("j", "join", []),
    ];
    expect(failed(flow, reg)).toEqual([]);
  });

  // ── two independent back-edges into one join ──────────────────────────────
  it("two back-edges into one join are each checked against the invariant", () => {
    const reg: Registry = {
      start: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ n: number }" }],
      },
      j: {
        reads: "{ n: number }",
        ports: [{ name: "o", adds: "{ step: number }" }],
      },
      good: {
        reads: "{ n: number }",
        ports: [{ name: "o", adds: "{ n: number }" }],
      }, // preserves n
      bad: {
        reads: "{ n: number }",
        ports: [{ name: "o", adds: "{ n: string }" }],
      }, // breaks n
    };
    const flow = [
      tab,
      n("s", "start", [["j"]]),
      n("j", "j", [["g", "b"]]),
      n("g", "good", [["j"]]), // valid back-edge
      n("b", "bad", [["j"]]), // invariant-violating back-edge
    ];
    const bad = failed(flow, reg);
    expect(bad).toContain("b:0:j");
    expect(bad).not.toContain("g:0:j");
  });

  // ── union output ──────────────────────────────────────────────────────────
  it("a union-typed added field satisfies a union reader but reds a narrow reader", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ x: number | string }" }],
      },
      wantUnion: { reads: "{ x: number | string }", ports: [] },
      wantNum: { reads: "{ x: number }", ports: [] }, // narrower → could be string → RED
    };
    expect(
      failed([tab, n("s", "src", [["r"]]), n("r", "wantUnion", [])], reg),
    ).toEqual([]);
    expect(
      failed([tab, n("s", "src", [["r"]]), n("r", "wantNum", [])], reg),
    ).toEqual(["s:0:r"]);
  });

  // ── a default `object` reader accepts any record ──────────────────────────
  it("a reader declaring `object` accepts any upstream record", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ a: number }" }],
      },
      anyReader: { reads: "object", ports: [] },
    };
    expect(
      failed([tab, n("s", "src", [["r"]]), n("r", "anyReader", [])], reg),
    ).toEqual([]);
  });

  // ── dangling wire: a target id absent from the flow ───────────────────────
  it("a wire to a missing target node never throws and is not a false RED", () => {
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ a: number }" }],
      },
    };
    // "ghost" is not present in the flow
    const report = checkFlowConfig([tab, n("s", "src", [["ghost"]])], reg);
    expect(report.ok).toBe(true);
    expect(report.wires.every((w) => w.ok)).toBe(true);
  });

  // ── EXTERNAL package types (the jsforce case) ─────────────────────────────
  it("resolves an external package type via srcDir and checks THROUGH it", () => {
    // A port whose adds references a type from an installed package
    // (`import("typescript").LineAndCharacter` = { line: number; character: number })
    // — the analogue of salesforce's `import("jsforce").Record[]`. Passing srcDir
    // roots the synth program inside this repo, so node_modules resolution finds
    // the package. A structurally-matching reader is GREEN; a mismatched reader is
    // RED with a real field error — and crucially NOT a "Cannot find module" fault.
    const srcDir = path.join(process.cwd(), "src");
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [
          { name: "o", adds: '{ pos: import("typescript").LineAndCharacter }' },
        ],
      },
      good: { reads: "{ pos: { line: number } }", ports: [] }, // structural subset ✓
      bad: { reads: "{ pos: string }", ports: [] }, // wrong type on the external field ✗
    };

    const ok = checkFlowConfig(
      [tab, n("s", "src", [["r"]]), n("r", "good", [])],
      reg,
      "",
      srcDir,
    );
    expect(ok.wires.find((w) => w.id === "s:0:r")?.ok).toBe(true);
    expect(ok.internalError).toBe(false);

    const red = checkFlowConfig(
      [tab, n("s", "src", [["r"]]), n("r", "bad", [])],
      reg,
      "",
      srcDir,
    );
    const w = red.wires.find((wi) => wi.id === "s:0:r");
    expect(w?.ok).toBe(false);
    expect(w?.message).toMatch(/not assignable/);
    expect(red.internalError).toBe(false);
    // the external module actually resolved — no module-not-found leaked anywhere
    expect(JSON.stringify(red)).not.toContain("Cannot find module");
  });

  it("a core node in the MIDDLE un-checks its input but the next typed port re-anchors", () => {
    // typed → core(change) → typed. The core node is an any boundary; the node
    // after it re-anchors to its declared adds, so a downstream mismatch is caught.
    const reg: Registry = {
      src: {
        source: true,
        reads: "object",
        ports: [{ name: "o", adds: "{ a: number }" }],
      },
      after: { reads: "any", ports: [{ name: "o", adds: "{ b: number }" }] },
      wantB: { reads: "{ b: number }", ports: [] },
      wantMissing: { reads: "{ c: number }", ports: [] },
    };
    const okFlow = [
      tab,
      n("s", "src", [["chg"]]),
      n("chg", "change", [["af"]]), // core node — unchecked boundary
      n("af", "after", [["r"]]),
      n("r", "wantB", []),
    ];
    const report = checkFlowConfig(okFlow, reg);
    expect(report.uncheckedTypes).toContain("change");
    expect(report.wires.filter((w) => !w.ok)).toEqual([]);
    // and a genuine downstream mismatch after the re-anchor is still caught
    const badFlow = [
      tab,
      n("s", "src", [["chg"]]),
      n("chg", "change", [["af"]]),
      n("af", "after", [["r"]]),
      n("r", "wantMissing", []),
    ];
    expect(failed(badFlow, reg)).toEqual(["af:0:r"]);
  });
});
