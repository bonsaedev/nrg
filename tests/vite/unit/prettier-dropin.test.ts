import { describe, it, expect } from "vitest";
import { format } from "prettier";
import config from "../../../src/tools/prettier";

// The shared Prettier config (@bonsae/nrg/prettier) is a plain options object a
// consumer re-exports from their own prettier config. These tests prove it's a
// config Prettier accepts, its options take effect, and a consumer can spread
// and override it.

describe("nrg prettier config", () => {
  it("is a plain options object (spreadable into a consumer config)", () => {
    expect(typeof config).toBe("object");
    expect(config).not.toBeNull();
    expect(Array.isArray(config)).toBe(false);
  });

  it("formats code through Prettier out of the box", async () => {
    const out = await format("const x=1", { ...config, parser: "typescript" });
    expect(out).toBe("const x = 1;\n");
  });

  it("applies its options (trailingComma: all)", async () => {
    const out = await format("const o = {\n  a: 1,\n  b: 2\n}", {
      ...config,
      parser: "typescript",
    });
    // A multiline object gets a trailing comma on the last property.
    expect(out).toContain("b: 2,");
  });

  it("can be spread and overridden by a consumer", async () => {
    const out = await format('const s = "hi"', {
      ...config,
      singleQuote: true,
      parser: "typescript",
    });
    expect(out).toBe("const s = 'hi';\n");
  });
});
