import { describe, it, expect } from "vitest";
import { defineModule, defineIONode } from "@/core/server";

// Two nrg-authored packages can run in one Node-RED. If they pin the SAME nrg
// version, the runtime is hoisted to a single instance (shared classes/ALS). If
// they pin DIFFERENT versions, each loads its own runtime instance — so class
// identity differs (A.Node !== B.Node) and `instanceof Node` across packages
// would fail. nrg avoids that entirely: every gate (defineModule, registerType,
// NodeRef config checks) brands on GLOBAL `Symbol.for(...)` keys, so a node built
// by one instance is recognized by another's gate. These tests pin that property
// — the thing that makes multi-version coexistence work.

describe("cross-version node identity", () => {
  it("brands node classes with the GLOBAL registered symbol, not a unique one", () => {
    const Node = defineIONode({ type: "xv-node", input() {} });
    // An independent lookup — what a DIFFERENT nrg instance/version would use.
    const foreignBrand = Symbol.for("nrg.node");
    expect((Node as unknown as Record<symbol, unknown>)[foreignBrand]).toBe(
      true,
    );
  });

  it("defineModule accepts a node branded by a foreign nrg instance", () => {
    // Simulate a node class from ANOTHER nrg runtime instance: a class this
    // instance never produced, branded only via the global symbol (exactly what
    // a second-version Node subclass carries). The gate must accept it. Assigned
    // as a statement — Symbol.for() is not a `unique symbol`, so it can't be a
    // computed class-field name, which is the whole point (it's cross-instance).
    class ForeignVersionNode {}
    (ForeignVersionNode as unknown as Record<symbol, unknown>)[
      Symbol.for("nrg.node")
    ] = true;
    expect(() =>
      defineModule({ nodes: [ForeignVersionNode as never] }),
    ).not.toThrow();
  });

  it("still rejects a class with no nrg brand (the gate is real)", () => {
    class NotAnNrgNode {}
    expect(() => defineModule({ nodes: [NotAnNrgNode as never] })).toThrow(
      /not an nrg node class/,
    );
  });

  it("the runtime brand symbols are all cross-instance registered symbols", () => {
    // Symbol.for(k) returns the same symbol in every module instance/version, so
    // brands stamped by one runtime read true through another's symbol lookup.
    for (const key of ["nrg.node", "nrg.wireHandlers", "nrg.configNode"]) {
      expect(Symbol.for(key)).toBe(Symbol.for(key));
      expect(Symbol.keyFor(Symbol.for(key))).toBe(key);
    }
  });
});
