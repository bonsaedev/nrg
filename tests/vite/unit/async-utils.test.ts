import { describe, it, expect, vi } from "vitest";
import { withTimeout, retry } from "@/tools/vite/async-utils";

// `debounce` was removed from async-utils in favour of es-toolkit's `debounce`
// (single implementation across the client + the vite plugin); es-toolkit tests
// its own debounce, so there's nothing to cover here.

describe("withTimeout", () => {
  it("should resolve when promise completes before timeout", async () => {
    const promise = Promise.resolve("done");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("done");
  });

  it("should reject when promise exceeds timeout", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(promise, 10)).rejects.toThrow(
      "Timeout after 10ms",
    );
  });

  it("should resolve with fallback when timeout and fallback provided", async () => {
    const promise = new Promise<string>((resolve) =>
      setTimeout(() => resolve("late"), 500),
    );
    const result = await withTimeout(promise, 10, "fallback");
    expect(result).toBe("fallback");
  });

  it("should reject when promise rejects before timeout", async () => {
    const promise = Promise.reject(new Error("failed"));
    await expect(withTimeout(promise, 1000)).rejects.toThrow("failed");
  });
});

describe("retry", () => {
  it("should return result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("success");
    const result = await retry(fn, { attempts: 3, delay: 0 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("should retry on failure and succeed", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");

    const result = await retry(fn, { attempts: 3, delay: 0 });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw after exhausting all attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));

    await expect(retry(fn, { attempts: 3, delay: 0 })).rejects.toThrow(
      "always fails",
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should use default options", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await retry(fn);
    expect(result).toBe("ok");
  });

  it("should throw the last error", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("error 1"))
      .mockRejectedValueOnce(new Error("error 2"));

    await expect(retry(fn, { attempts: 2, delay: 0 })).rejects.toThrow(
      "error 2",
    );
  });
});
