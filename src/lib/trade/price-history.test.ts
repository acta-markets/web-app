import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPriceHistory } from "./price-history";

const json = (body: unknown) => new Response(JSON.stringify(body));
const SERIES: Array<[number, number]> = [[2_000_000, 101], [1_000_000, 100]];
const NO_WAIT = [0, 0, 0];

describe("loadPriceHistory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the series oldest first, in seconds", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true, points: SERIES }));
    const points = await loadPriceHistory("SOL", "1w", new AbortController().signal);
    expect(points).toEqual([{ t: 1000, v: 100 }, { t: 2000, v: 101 }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/market/history?symbol=SOL&range=1w");
  });

  it("asks again after a passing failure and returns the series once it arrives", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(json({ ok: true, points: [], retry: true }))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(json({ ok: true, points: SERIES }));
    const points = await loadPriceHistory("BTC", "1w", new AbortController().signal, NO_WAIT);
    expect(points).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry an asset that simply has no history", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ ok: true, source: "none", points: [] }));
    expect(await loadPriceHistory("USDG", "1w", new AbortController().signal, NO_WAIT)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up with an empty series when the retries run out", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ points: [], retry: true }));
    expect(await loadPriceHistory("BTC", "1w", new AbortController().signal, NO_WAIT)).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(NO_WAIT.length + 1);
  });

  it("stops retrying once aborted", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ points: [], retry: true }));
    const ctl = new AbortController();
    const pending = loadPriceHistory("BTC", "1w", ctl.signal, [60_000]);
    ctl.abort();
    expect(await pending).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
