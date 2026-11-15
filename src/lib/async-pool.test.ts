// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { mapLimit, withRetry } from "./async-pool";

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
});
