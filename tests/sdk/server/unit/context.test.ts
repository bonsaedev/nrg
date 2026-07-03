import { describe, it, test, expect, vi } from "vitest";
import { createContextStore } from "@/sdk/test/server/unit/mocks";
import { setupContext } from "@/sdk/lib/server/nodes/context";

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

describe("setupContext — get/set/keys", () => {
  it("should get a value", async () => {
    const store = createContextStore();
    store.get.mockImplementation((key: string, _store: any, cb: Function) =>
      cb(null, "hello"),
    );

    const ctx = setupContext(store);
    const value = await ctx.get("test");
    expect(value).toBe("hello");
  });

  it("should set a value", async () => {
    const store = createContextStore();
    const ctx = setupContext(store);
    await ctx.set("key", "value");
    expect(store.set).toHaveBeenCalledWith(
      "key",
      "value",
      undefined,
      expect.any(Function),
    );
  });

  it("should get keys", async () => {
    const store = createContextStore();
    const ctx = setupContext(store);
    await ctx.set("a", 1);
    await ctx.set("b", 2);
    const keys = await ctx.keys();
    expect(keys).toEqual(["a", "b"]);
  });

  it("should reject on get error", async () => {
    const store = createContextStore();
    store.get.mockImplementation((_key: string, _store: any, cb: Function) =>
      cb(new Error("get failed")),
    );

    const ctx = setupContext(store);
    await expect(ctx.get("test")).rejects.toThrow("get failed");
  });

  it("should reject on set error", async () => {
    const store = createContextStore();
    store.set.mockImplementation(
      (_key: string, _val: any, _store: any, cb: Function) =>
        cb(new Error("set failed")),
    );

    const ctx = setupContext(store);
    await expect(ctx.set("key", "val")).rejects.toThrow("set failed");
  });

  it("should reject on keys error", async () => {
    const store = createContextStore();
    store.keys.mockImplementation((_store: any, cb: Function) =>
      cb(new Error("keys failed")),
    );

    const ctx = setupContext(store);
    await expect(ctx.keys()).rejects.toThrow("keys failed");
  });

  it("should pass store name to context methods", async () => {
    const store = createContextStore();
    const ctx = setupContext(store, "file");
    await ctx.set("key", "value");
    expect(store.set).toHaveBeenCalledWith(
      "key",
      "value",
      "file",
      expect.any(Function),
    );
  });
});
