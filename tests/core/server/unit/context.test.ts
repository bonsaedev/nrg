import { describe, test, expect, vi } from "vitest";
import { createContextStore } from "@/test/server/unit/mocks";
import { setupContext } from "@/core/server/nodes/utils";

describe("setupContext — atomic increment/update", () => {
  test("increment returns the running total", async () => {
    const ctx = setupContext(createContextStore());
    expect(await ctx.increment("c")).toBe(1);
    expect(await ctx.increment("c", 4)).toBe(5);
  });

  test("increment is atomic under concurrency (in-process fallback)", async () => {
    const ctx = setupContext(createContextStore());
    await Promise.all(Array.from({ length: 100 }, () => ctx.increment("c")));
    expect(await ctx.get("c")).toBe(100);
  });

  test("update serializes concurrent read-modify-write (no clobbering)", async () => {
    const ctx = setupContext(createContextStore());
    await ctx.set("list", [] as string[]);
    await Promise.all(
      ["a", "b", "c"].map((x) =>
        ctx.update<string[]>("list", (v) => [...(v ?? []), x]),
      ),
    );
    expect(((await ctx.get<string[]>("list")) ?? []).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("delegates to the store's native increment when present", async () => {
    const native = Object.assign(createContextStore(), {
      increment: vi.fn(
        (
          _k: string,
          _by: number,
          _s: string | undefined,
          cb: (e: unknown, v: number) => void,
        ) => cb(null, 999),
      ),
    });
    const ctx = setupContext(native);
    expect(await ctx.increment("c", 5)).toBe(999);
    expect(native.increment).toHaveBeenCalledWith(
      "c",
      5,
      undefined,
      expect.any(Function),
    );
  });

  test("delegates to the store's native update when present", async () => {
    const native = Object.assign(createContextStore(), {
      update: vi.fn(
        (
          _k: string,
          _fn: unknown,
          _s: string | undefined,
          cb: (e: unknown, v: unknown) => void,
        ) => cb(null, "native"),
      ),
    });
    const ctx = setupContext(native);
    expect(await ctx.update("c", () => "ignored")).toBe("native");
    expect(native.update).toHaveBeenCalled();
  });
});
