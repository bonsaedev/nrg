import { describe, it, expect, vi } from "vitest";
import { debounce, withTimeout, retry } from "../../../src/vite/async-utils";

describe("debounce", () => {
  it("should delay execution", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();

    vi.useRealTimers();
  });

  it("should cancel previous call on rapid invocations", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("a");
    debounced("b");
    debounced("c");

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith("c");

    vi.useRealTimers();
  });

  it("should allow separate calls after delay", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced("first");
    vi.advanceTimersByTime(100);

    debounced("second");
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, "first");
    expect(fn).toHaveBeenNthCalledWith(2, "second");

    vi.useRealTimers();
  });
});

describe("withTimeout", () => {
  it("should resolve when promise completes before timeout", async () => {
    const promise = Promise.resolve("done");
    const result = await withTimeout(promise, 1000);
    expect(result).toBe("done");
  });

  it("should reject when promise exceeds timeout", async () => {
    const promise = new Promise((resolve) => setTimeout(resolve, 500));
    await expect(withTimeout(promise, 10)).rejects.toThrow("Timeout after 10ms");
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
