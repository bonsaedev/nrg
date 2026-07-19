import { describe, it, expect } from "vitest";
import { compileFlow } from "@/tools/vite/server/wire-check/compile";
import type {
  FlowNode,
  Registry,
} from "@/tools/vite/server/wire-check/compile";
import { checkFlowConfig } from "@/tools/vite/server/wire-check/flow-check";

// The flow wire check end to end (compile → in-memory tsc → per-wire verdicts)
// under the accumulating-record model. These scenarios are the production port
// of the validated `.poc-wiring/accumulation` experiment matrix.

const ORDER = "{ id: number; total: number }";
const CUSTOMER = "{ name: string; vip: boolean }";
const PRICING = "{ tax: number; grandTotal: number }";

const REGISTRY: Registry = {
  intake: {
    source: true,
    reads: "object",
    ports: [{ name: "out", adds: `{ order: ${ORDER} }` }],
  },
  "add-customer": {
    reads: `{ order: ${ORDER} }`,
    ports: [{ name: "out", adds: `{ customer: ${CUSTOMER} }` }],
  },
  "add-pricing": {
    reads: `{ order: ${ORDER} }`,
    ports: [{ name: "out", adds: `{ pricing: ${PRICING} }` }],
  },
  "price-gate": {
    reads: `{ pricing: ${PRICING} }`,
    ports: [
      { name: "ok", adds: "{ priceOk: true }" },
      { name: "retry", adds: "{ attempt: number }" },
    ],
  },
  invoice: {
    reads: `{ order: ${ORDER}; customer: ${CUSTOMER}; pricing: ${PRICING} }`,
    ports: [],
  },
  iterator: {
    reads: "{ items: string[] }",
    ports: [{ name: "item", adds: "{ item: string; index: number }" }],
    complete: "{ results: string[] }",
  },
  "wants-results": { reads: "{ results: string[] }", ports: [] },
};

const tab: FlowNode = { id: "t", type: "tab" };
const n = (
  id: string,
  type: string,
  wires: string[][],
  extra: Partial<FlowNode> = {},
): FlowNode => ({ id, type, z: "t", name: id, wires, ...extra });

describe("wire-check flow-check (accumulating-record model)", () => {
  it("GREEN: an enrichment chain accumulates — a 3-hop-old field satisfies the reader", () => {
    const report = checkFlowConfig(
      [
        tab,
        n("src", "intake", [["ac"]]),
        n("ac", "add-customer", [["ap"]]),
        n("ap", "add-pricing", [["inv"]]),
        n("inv", "invoice", []),
      ],
      REGISTRY,
    );
    expect(report.ok).toBe(true);
    expect(report.wires).toHaveLength(3);
    expect(report.wires.every((w) => w.ok)).toBe(true);
  });

  it("RED at the reader's wire when an enricher is deleted", () => {
    const report = checkFlowConfig(
      [
        tab,
        n("src", "intake", [["ap"]]),
        n("ap", "add-pricing", [["inv"]]),
        n("inv", "invoice", []),
      ],
      REGISTRY,
    );
    expect(report.ok).toBe(false);
    const bad = report.wires.filter((w) => !w.ok);
    expect(bad).toHaveLength(1);
    expect(bad[0].id).toBe("ap:0:inv");
    expect(bad[0].message).toMatch(/customer/);
  });

  it("GREEN: a feedback loop is typed via the join's loop invariant (no reset node)", () => {
    const report = checkFlowConfig(
      [
        tab,
        n("src", "intake", [["ac"]]),
        n("ac", "add-customer", [["ap"]]),
        n("ap", "add-pricing", [["pg"]]),
        n("pg", "price-gate", [["inv"], ["ac"]]), // retry wired straight back
        n("inv", "invoice", []),
      ],
      REGISTRY,
    );
    expect(report.ok).toBe(true);
    // the back-edge wire is present and checked against the invariant
    expect(report.wires.some((w) => w.id === "pg:1:ac")).toBe(true);
  });

  it("a typed port RE-ANCHORS its output after a core (any) boundary — the mismatch is still caught", () => {
    const report = checkFlowConfig(
      [
        tab,
        n("inj", "inject", [["it"]]),
        n("it", "iterator", [["w"], ["dbg"]], { completePort: true }),
        n("w", "wants-results", []), // reads { results } off the per-item record
        n("dbg", "debug", []),
      ],
      REGISTRY,
    );
    // the core types are reported as the unchecked boundary...
    expect(report.uncheckedTypes.sort()).toEqual(["debug", "inject"]);
    // ...but the iterator's item port output is its DECLARED adds `{item,index}`:
    // `Omit<any, keyof Adds> & Adds` collapses to `Adds`, so a typed port
    // re-anchors even when fed `any`. Reading `{results}` downstream is therefore
    // still caught RED at exactly that wire — no reset mode needed.
    const bad = report.wires.filter((w) => !w.ok);
    expect(bad.map((w) => w.id)).toEqual(["it:0:w"]);
    expect(bad[0].message).toMatch(/results/);
  });

  it("the builtin complete port carries input()'s return type", () => {
    const report = checkFlowConfig(
      [
        tab,
        n("inj", "inject", [["it"]]),
        n("it", "iterator", [[], ["ok"]], { completePort: true }),
        n("ok", "wants-results", []),
      ],
      REGISTRY,
    );
    expect(report.ok).toBe(true);
    expect(report.wires.find((w) => w.id === "it:1:ok")?.ok).toBe(true);
  });

  it("disabled nodes and their wires vanish from the check", () => {
    const report = checkFlowConfig(
      [
        tab,
        n("src", "intake", [["ac"]]),
        n("ac", "add-customer", [["ap", "old"]]),
        n("ap", "add-pricing", [["inv"]]),
        n("old", "add-pricing", [["inv"]], { d: true }),
        n("inv", "invoice", []),
      ],
      REGISTRY,
    );
    expect(report.ok).toBe(true);
    expect(report.wires.some((w) => w.id.includes("old"))).toBe(false);
  });

  it("fails OPEN (never throws) on a malformed flow", () => {
    const report = checkFlowConfig(
      [tab, n("x", "iterator", [[], [], [], ["nowhere-slot"]])],
      REGISTRY,
    );
    expect(report.ok).toBe(true);
    expect(report.unattributed.length).toBeGreaterThan(0);
  });

  it("a built-in lifecycle port MERGES the record — a carried-field reader is GREEN, a missing field is RED", () => {
    // `enrich` reads `{ order }` and adds `{ customer }`; its complete port has
    // no input() return, so at runtime it forwards the processed record. A reader
    // wired off the complete port that needs the CARRIED `order` must be GREEN
    // (the record is carried), and one needing a field nobody produced must RED.
    const reg: Registry = {
      intake: REGISTRY.intake,
      enrich: {
        reads: `{ order: ${ORDER} }`,
        ports: [{ name: "out", adds: `{ customer: ${CUSTOMER} }` }],
      },
      "needs-order": { reads: `{ order: ${ORDER} }`, ports: [] },
      "needs-missing": { reads: `{ missing: boolean }`, ports: [] },
    };
    const green = checkFlowConfig(
      [
        tab,
        n("src", "intake", [["en"]]),
        // wires[0] = data `out`, wires[1] = built-in complete
        n("en", "enrich", [[], ["ok"]], { completePort: true }),
        n("ok", "needs-order", []),
      ],
      reg,
    );
    expect(green.ok).toBe(true);
    expect(green.wires.find((w) => w.id === "en:1:ok")?.ok).toBe(true);

    const red = checkFlowConfig(
      [
        tab,
        n("src", "intake", [["en"]]),
        n("en", "enrich", [[], ["bad"]], { completePort: true }),
        n("bad", "needs-missing", []),
      ],
      reg,
    );
    expect(red.wires.filter((w) => !w.ok).map((w) => w.id)).toEqual([
      "en:1:bad",
    ]);
  });

  it("fan-in attributes a mismatch to the CULPRIT wire, not all incoming wires", () => {
    const reg: Registry = {
      "src-order": {
        source: true,
        reads: "object",
        ports: [{ name: "out", adds: `{ order: ${ORDER} }` }],
      },
      "src-other": {
        source: true,
        reads: "object",
        ports: [{ name: "out", adds: "{ other: string }" }],
      },
      join: { reads: `{ order: ${ORDER} }`, ports: [] },
    };
    const report = checkFlowConfig(
      [
        tab,
        n("a", "src-order", [["j"]]),
        n("b", "src-other", [["j"]]), // no `order` → the culprit
        n("j", "join", []),
      ],
      reg,
    );
    // only b's wire is red; a (which supplies `order`) stays green
    expect(report.wires.filter((w) => !w.ok).map((w) => w.id)).toEqual([
      "b:0:j",
    ]);
    expect(report.wires.find((w) => w.id === "a:0:j")?.ok).toBe(true);
  });

  it("compileFlow maps every failing diagnostic line to its wire", () => {
    const { wiresByLine, wires } = compileFlow(
      [
        tab,
        n("src", "intake", [["ac"]]),
        n("ac", "add-customer", [["inv"]]),
        n("inv", "invoice", []),
      ],
      REGISTRY,
    );
    expect(wires.map((w) => w.id).sort()).toEqual(["ac:0:inv", "src:0:ac"]);
    const mapped = [...wiresByLine.values()].flat().map((w) => w.id);
    expect(mapped).toContain("ac:0:inv");
  });
});
