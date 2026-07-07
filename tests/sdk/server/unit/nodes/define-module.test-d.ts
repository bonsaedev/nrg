import { describe, it } from "vitest";
import { defineModule, IONode, ConfigNode } from "@bonsae/nrg/server";

// The NRG_NODE brand is private (never exported), so these proofs assert that
// `defineModule` accepts only nrg-authored node classes and rejects anything
// that merely looks like one.
describe("defineModule brand", () => {
  it("accepts nrg node classes", () => {
    class ClassIONode extends IONode {}
    class ClassConfigNode extends ConfigNode {}

    defineModule({
      nodes: [ClassIONode, ClassConfigNode],
    });
  });

  it("rejects a plain class (no brand)", () => {
    class NotANode {}
    defineModule({
      // @ts-expect-error — NotANode is not an nrg node class (missing NRG_NODE brand)
      nodes: [NotANode],
    });
  });

  it("rejects a structural look-alike (brand can't be forged)", () => {
    class FakeNode {
      static readonly type = "fake";
      static readonly category = "function";
    }
    defineModule({
      // @ts-expect-error — a structural match is not enough without the private brand
      nodes: [FakeNode],
    });
  });
});
