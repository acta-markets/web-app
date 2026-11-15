// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { isRateLimited, isTransportError, mapLimit, withRetry } from "./async-pool";

describe("mapLimit", () => {
  it("keeps the order and never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3, 6, 0], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, n));
      running--;
      return n * 2;
    });
    expect(out).toEqual([10, 2, 8, 4, 6, 12, 0]);
    expect(peak).toBe(3);
  });

  it("rejects on the first failure and starts nothing after it", async () => {
    const seen: number[] = [];
    await expect(
      mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
        seen.push(n);
        if (n === 2) throw new Error("boom");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return n;
      }),
    ).rejects.toThrow("boom");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(seen).toEqual([1, 2]);
  });

  it("returns an empty list for no items", async () => {
    await expect(mapLimit([], 4, async () => 1)).resolves.toEqual([]);
  });
});

describe("withRetry", () => {
  it("tries again after a thrown error and returns the first success", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("dropped")).mockResolvedValue("ok");
    await expect(withRetry(fn, { delayMs: 1 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the last try with the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("still down"));
    await expect(withRetry(fn, { tries: 3, delayMs: 1 })).rejects.toThrow("still down");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not try again once aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fn = vi.fn().mockRejectedValue(new Error("stopped"));
    await expect(withRetry(fn, { delayMs: 1, signal: controller.signal })).rejects.toThrow("stopped");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits out a refusal for rate with more tries than a dropped request gets", async () => {
    const limited = new Error("HTTP error (429): Too Many Requests");
    const fn = vi.fn().mockRejectedValue(limited);
    await expect(withRetry(fn, { tries: 3, delayMs: 1, rateLimitDelayMs: 1 })).rejects.toThrow("429");
    expect(fn).toHaveBeenCalledTimes(7);
    // the fifth try gets through: with three tries it would have failed
    const eventually = vi.fn().mockRejectedValueOnce(limited).mockRejectedValueOnce(limited).mockRejectedValueOnce(limited).mockRejectedValueOnce(limited).mockResolvedValue("ok");
    await expect(withRetry(eventually, { tries: 3, delayMs: 1, rateLimitDelayMs: 1 })).resolves.toBe("ok");
    expect(eventually).toHaveBeenCalledTimes(5);
  });

  it("only tries again what `when` lets through", async () => {
    const rejected = vi.fn().mockRejectedValue(new Error("Transaction simulation failed: custom program error"));
    await expect(withRetry(rejected, { delayMs: 1, when: isTransportError })).rejects.toThrow("simulation failed");
    expect(rejected).toHaveBeenCalledTimes(1);
    const dropped = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValue("ok");
    await expect(withRetry(dropped, { delayMs: 1, when: isTransportError })).resolves.toBe("ok");
    expect(dropped).toHaveBeenCalledTimes(2);
  });
});

describe("isRateLimited and isTransportError", () => {
  it("knows a 429 by its status or its message", () => {
    expect(isRateLimited(Object.assign(new Error("HTTP error"), { context: { statusCode: 429 } }))).toBe(true);
    expect(isRateLimited(new Error("HTTP error (429): Too Many Requests"))).toBe(true);
    expect(isRateLimited(new Error("HTTP error (500): Internal Server Error"))).toBe(false);
    expect(isRateLimited(new Error("custom program error: 0x429"))).toBe(false);
  });

  it("tells a request that got no answer from an answer that says no", () => {
    expect(isTransportError(new Error("HTTP error (429): Too Many Requests"))).toBe(true);
    expect(isTransportError(new Error("HTTP error (502): Bad Gateway"))).toBe(true);
    expect(isTransportError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isTransportError(new Error("Transaction simulation failed: Error processing Instruction 1"))).toBe(false);
    expect(isTransportError(new Error("User rejected the request"))).toBe(false);
  });
});
