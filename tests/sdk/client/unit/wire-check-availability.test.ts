import { describe, it, expect, vi, beforeEach } from "vitest";

// The availability gate probes the transport once and publishes the result to a
// Vue ref that both the event hooks and the node form read. We mock the
// transport (same style as the orchestration test) so `refreshTypeCheckAvailability`
// can be driven to either verdict without a real admin route.

// `vi.hoisted` so the mock fn is initialized before the hoisted `vi.mock`
// factory runs — the availability module is imported statically below, which
// triggers the factory during initial evaluation.
const { fetchStatus } = vi.hoisted(() => ({ fetchStatus: vi.fn() }));
vi.mock("@/sdk/lib/client/wire-check/transport", () => ({
  fetchStatus,
  checkWire: vi.fn(),
  checkWires: vi.fn(),
}));

import {
  typeCheckEnabled,
  refreshTypeCheckAvailability,
} from "@/sdk/lib/client/wire-check/availability";

describe("wire-check availability", () => {
  beforeEach(() => {
    fetchStatus.mockReset();
  });

  it("defaults to disabled until the plugin is probed", () => {
    expect(typeCheckEnabled.value).toBe(false);
  });

  it("enables the feature when the plugin reports available", async () => {
    fetchStatus.mockResolvedValueOnce({ available: true });
    await refreshTypeCheckAvailability();
    expect(typeCheckEnabled.value).toBe(true);
  });

  it("disables the feature when the plugin reports unavailable", async () => {
    typeCheckEnabled.value = true; // prove a later probe can turn it back off
    fetchStatus.mockResolvedValueOnce({ available: false });
    await refreshTypeCheckAvailability();
    expect(typeCheckEnabled.value).toBe(false);
  });
});
