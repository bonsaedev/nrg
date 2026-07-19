import { describe, it, expect } from "vitest";
import {
  failedWires,
  warnedWires,
  reportSummary,
  linkDatumId,
} from "@/sdk/lib/client/wire-check/report";
import type { FlowReport } from "@/sdk/lib/client/wire-check/report";

// Pure helpers of the deploy-report consumer (the painter itself is a thin
// best-effort DOM layer over these).

const report = (wires: FlowReport["wires"]): FlowReport => ({
  ok: wires.every((w) => w.ok),
  wires,
  uncheckedTypes: [],
  unattributed: [],
  checkedAt: "2026-01-01T00:00:00.000Z",
});

const wire = (id: string, ok: boolean): FlowReport["wires"][number] => ({
  id,
  label: id.replace(/:/g, " → "),
  ok,
  ...(ok ? {} : { message: "type mismatch" }),
});

describe("wire-check report helpers", () => {
  it("failedWires picks exactly the failing wires", () => {
    const r = report([wire("a:0:b", true), wire("b:0:c", false)]);
    expect(failedWires(r).map((w) => w.id)).toEqual(["b:0:c"]);
  });

  it("warnedWires picks the PASSING wires that carry a caveat (not failures)", () => {
    const r = report([
      { id: "a:0:b", label: "a → b", ok: true, warn: "untyped source" },
      wire("b:0:c", true), // clean pass, no warn
      { id: "c:0:d", label: "c → d", ok: false, message: "x", warn: "ignored" },
    ]);
    // only the green-but-warned wire; a failed wire is red, never yellow
    expect(warnedWires(r).map((w) => w.id)).toEqual(["a:0:b"]);
  });

  it("summary is a sticky error listing failing wires, capped at 5", () => {
    const r = report(
      Array.from({ length: 7 }, (_, i) => wire(`n${i}:0:m${i}`, false)),
    );
    const s = reportSummary(r, false);
    expect(s?.level).toBe("error");
    expect(s?.text).toContain("7 wire(s) failed");
    expect((s?.text.match(/<li>/g) ?? []).length).toBe(5);
    expect(s?.text).toContain("and 2 more");
  });

  it("a green report is silent unless the previous report had failures", () => {
    const green = report([wire("a:0:b", true)]);
    expect(reportSummary(green, false)).toBeNull();
    const s = reportSummary(green, true);
    expect(s?.level).toBe("success");
    expect(s?.text).toContain("all 1 wire(s) green");
  });

  it("linkDatumId mirrors the plan's wire-id scheme from a canvas link datum", () => {
    expect(
      linkDatumId({ source: { id: "s" }, sourcePort: 2, target: { id: "t" } }),
    ).toBe("s:2:t");
    // a missing sourcePort is port 0 (single-output nodes omit it)
    expect(linkDatumId({ source: { id: "s" }, target: { id: "t" } })).toBe(
      "s:0:t",
    );
    expect(linkDatumId(undefined)).toBeNull();
    expect(linkDatumId({ source: {} })).toBeNull();
  });
});
