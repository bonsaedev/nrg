import { describe, it } from "vitest";
import {
  defineModule,
  defineIONode,
  defineConfigNode,
  IONode,
  ConfigNode,
} from "@bonsae/nrg/server";

// The NRG_NODE brand is private (never exported), so these proofs assert that
// `defineModule` accepts only nrg-authored node classes and rejects anything
// that merely looks like one.
describe("defineModule brand", () => {
  it("accepts nrg node classes (factory + class-based)", () => {
    const FactoryIONode = defineIONode({ type: "factory-io" });
    const FactoryConfigNode = defineConfigNode({ type: "factory-config" });

    class ClassIONode extends IONode {}
    class ClassConfigNode extends ConfigNode {}

    defineModule({
      nodes: [FactoryIONode, FactoryConfigNode, ClassIONode, ClassConfigNode],
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
