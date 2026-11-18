import { describe, expect, it } from "vitest";
import { EMPTY_DRAFT, TRADE_DETAILS_KEPT_MS, draftDetails, tradeDraftStore, tradeViewSearch, updateTradeDraft } from "./draft";

const NOW = 1_800_000_000_000;
const full = { asset: "SOL", direction: "below" as const, mode: "yield" as const, expiryTs: 1_800_600_000, strike: 150, amount: "12.5", inQuote: true };

describe("the Trade page's remembered setup", () => {
  it("starts empty", () => {
    expect(tradeDraftStore("devnet").read()).toEqual(EMPTY_DRAFT);
  });

  it("keeps what it is given, per backend", () => {
    const devnet = tradeDraftStore("devnet");
    updateTradeDraft(devnet, full, NOW);
    expect(devnet.read()).toEqual({ ...full, savedAt: NOW });
    expect(tradeDraftStore("mainnet").read()).toEqual(EMPTY_DRAFT);
  });

  it("restarts the day of the price, date and size only when one of them changes", () => {
    const store = tradeDraftStore("devnet");
    updateTradeDraft(store, full, NOW);
    updateTradeDraft(store, { mode: "profit", direction: "above" }, NOW + 5_000);
    expect(store.read().savedAt).toBe(NOW);
    updateTradeDraft(store, { amount: "13" }, NOW + 9_000);
    expect(store.read().savedAt).toBe(NOW + 9_000);
  });

  it("writes nothing when nothing changed", () => {
    const store = tradeDraftStore("devnet");
    updateTradeDraft(store, full, NOW);
    const before = window.localStorage.getItem(store.key);
    updateTradeDraft(store, { ...full }, NOW + 60_000);
    expect(window.localStorage.getItem(store.key)).toBe(before);
  });

  it.each([
    [{ asset: "<script>" }, { asset: null }],
    [{ asset: "SOL; DROP" }, { asset: null }],
    [{ direction: "sideways" }, { direction: null }],
    [{ mode: "pro" }, { mode: null }],
    [{ strike: -1 }, { strike: null }],
    [{ expiryTs: "soon" }, { expiryTs: null }],
    [{ amount: "1e9" }, { amount: null }],
    [{ amount: "12.5abc" }, { amount: null }],
    [{ inQuote: "yes" }, { inQuote: null }],
  ])("drops a stored field it cannot trust: %j", (stored, expected) => {
    const store = tradeDraftStore("devnet");
    window.localStorage.setItem(store.key, JSON.stringify({ v: 1, d: { ...full, savedAt: NOW, ...stored } }));
    expect(store.read()).toMatchObject(expected);
  });
});

describe("the price, date and size that come back", () => {
  const draft = { ...full, savedAt: NOW };

  it("come back for the asset they were chosen for, within a day", () => {
    expect(draftDetails(draft, "sol", NOW + TRADE_DETAILS_KEPT_MS)).toEqual({ expiryTs: 1_800_600_000, strike: 150, amount: "12.5", inQuote: true });
  });

  it("do not come back for another asset", () => {
    expect(draftDetails(draft, "BTC", NOW + 1_000)).toEqual({ expiryTs: null, strike: null, amount: null, inQuote: null });
    expect(draftDetails(draft, null, NOW + 1_000)).toEqual({ expiryTs: null, strike: null, amount: null, inQuote: null });
  });

  it("do not come back after a day", () => {
    expect(draftDetails(draft, "SOL", NOW + TRADE_DETAILS_KEPT_MS + 1)).toEqual({ expiryTs: null, strike: null, amount: null, inQuote: null });
  });

  it("do not come back from a draft that never had them", () => {
    expect(draftDetails({ ...EMPTY_DRAFT, asset: "SOL" }, "SOL", NOW)).toEqual({ expiryTs: null, strike: null, amount: null, inQuote: null });
  });
});

describe("the address of a Trade view", () => {
  it("names the asset and the direction and keeps what else was there", () => {
    expect(tradeViewSearch("?mode=yield", { asset: "SOL", direction: "below" })).toBe("mode=yield&asset=SOL&dir=below");
    expect(tradeViewSearch("?asset=BTC&dir=above", { asset: "SOL", direction: "above" })).toBe("asset=SOL&dir=above");
    expect(tradeViewSearch("", { asset: null, direction: "above" })).toBe("dir=above");
  });
});
