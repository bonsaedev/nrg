import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkWire,
  checkWires,
  fetchStatus,
} from "@/sdk/lib/client/wire-check/transport";
import type { WireCheckRequest } from "@/sdk/lib/client/wire-check/plan";

// The transport talks to the type-check plugin's admin routes through the
// editor's global jQuery `$.ajax`. Here we stub `$` so each ajax call drives a
// resolve path — `success` / `error` per case, or a throw — and assert the
// contract: every failure resolves to null / unavailable (fail OPEN, never
// reject), and only well-formed payloads pass the shape guards.

/** The subset of jQuery.ajax settings the transport passes. */
interface AjaxSettings {
  url: string;
  method: string;
  data?: string;
  success: (res: unknown) => void;
  error: () => void;
}

let ajax: ReturnType<typeof vi.fn>;

/** Install a `$.ajax` stub running `impl`; returns the spy for call assertions. */
function stubAjax(impl: (settings: AjaxSettings) => void): typeof ajax {
  ajax = vi.fn(impl);
  vi.stubGlobal("$", { ajax });
  return ajax;
}

const request: WireCheckRequest = {
  id: "s:0:t",
  source: { type: "src", module: "pkg", port: { kind: "base", index: 0 } },
  target: { type: "tgt", module: "pkg" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("wire-check transport — fetchStatus", () => {
  it("GETs the status route and reports available when it returns available:true", async () => {
    const spy = stubAjax((s) => s.success({ available: true }));
    await expect(fetchStatus()).resolves.toEqual({ available: true });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ url: "nrg/type-check/status", method: "GET" }),
    );
  });

  it("reports unavailable when the route returns available:false", async () => {
    stubAjax((s) => s.success({ available: false }));
    await expect(fetchStatus()).resolves.toEqual({ available: false });
  });

  it("coerces a non-true / missing available flag to false", async () => {
    stubAjax((s) => s.success({ available: "yes" }));
    await expect(fetchStatus()).resolves.toEqual({ available: false });
    stubAjax((s) => s.success({}));
    await expect(fetchStatus()).resolves.toEqual({ available: false });
  });

  it("reports unavailable when the route errors (plugin not installed → 404)", async () => {
    stubAjax((s) => s.error());
    await expect(fetchStatus()).resolves.toEqual({ available: false });
  });

  it("reports unavailable when $.ajax throws synchronously", async () => {
    stubAjax(() => {
      throw new Error("no ajax");
    });
    await expect(fetchStatus()).resolves.toEqual({ available: false });
  });
});

describe("wire-check transport — checkWire", () => {
  it("POSTs the request as JSON and returns a well-formed result", async () => {
    const result = { id: "s:0:t", ok: true, checked: true };
    const spy = stubAjax((s) => s.success(result));
    await expect(checkWire(request)).resolves.toEqual(result);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "nrg/type-check",
        method: "POST",
        data: JSON.stringify(request),
      }),
    );
  });

  it("returns null for a malformed result (no boolean ok)", async () => {
    stubAjax((s) => s.success({ id: "s:0:t" }));
    await expect(checkWire(request)).resolves.toBeNull();
  });

  it("returns null for a non-object result", async () => {
    stubAjax((s) => s.success(null));
    await expect(checkWire(request)).resolves.toBeNull();
  });

  it("returns null when the route errors", async () => {
    stubAjax((s) => s.error());
    await expect(checkWire(request)).resolves.toBeNull();
  });

  it("returns null when $.ajax throws synchronously", async () => {
    stubAjax(() => {
      throw new Error("boom");
    });
    await expect(checkWire(request)).resolves.toBeNull();
  });
});

describe("wire-check transport — checkWires", () => {
  it("POSTs a wires batch and returns the results array", async () => {
    const results = [
      { id: "a", ok: true, checked: true },
      { id: "b", ok: false, checked: true, message: "mismatch" },
    ];
    const spy = stubAjax((s) => s.success({ results }));
    await expect(checkWires([request])).resolves.toEqual(results);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "nrg/type-check/batch",
        method: "POST",
        data: JSON.stringify({ wires: [request] }),
      }),
    );
  });

  it("returns null when results is missing or not an array", async () => {
    stubAjax((s) => s.success({}));
    await expect(checkWires([request])).resolves.toBeNull();
    stubAjax((s) => s.success({ results: "nope" }));
    await expect(checkWires([request])).resolves.toBeNull();
  });

  it("returns null when any entry is malformed", async () => {
    stubAjax((s) =>
      s.success({
        results: [{ id: "a", ok: true, checked: true }, { id: "b" }],
      }),
    );
    await expect(checkWires([request])).resolves.toBeNull();
  });

  it("returns null when the route errors", async () => {
    stubAjax((s) => s.error());
    await expect(checkWires([request])).resolves.toBeNull();
  });
});
