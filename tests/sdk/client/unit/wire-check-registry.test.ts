import { describe, it, expect } from "vitest";
import {
  registerNrgType,
  isNrgType,
} from "@/sdk/lib/client/wire-check/registry";

// The registry is the set of node types nrg has registered this session; the
// wire checker uses membership to tell an nrg endpoint (resolvable module) from
// a plain Node-RED node.

describe("wire-check registry", () => {
  it("reports an unregistered type as non-nrg", () => {
    expect(isNrgType("inject")).toBe(false);
  });

  it("records a registered type and reports membership", () => {
    registerNrgType("my-package/my-node");
    expect(isNrgType("my-package/my-node")).toBe(true);
  });

  it("keeps unrelated types out of the set", () => {
    registerNrgType("a");
    expect(isNrgType("a")).toBe(true);
    expect(isNrgType("b")).toBe(false);
  });

  it("is idempotent for a repeated registration", () => {
    registerNrgType("dup");
    registerNrgType("dup");
    expect(isNrgType("dup")).toBe(true);
  });
});
