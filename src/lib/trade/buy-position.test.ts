import { describe, expect, it } from "vitest";
import { buyStatus, isInTheMoney, type BuyFacts } from "./buy-position";

const expiryTs = 1000;
const call: BuyFacts = { state: "open", expiryTs, isPut: false, strike1e9: 150, settlementPrice1e9: null };
const put: BuyFacts = { ...call, isPut: true };

describe("isInTheMoney", () => {
  it("counts a tie as out of the money on both sides", () => {
    expect(isInTheMoney(false, 150, 150)).toBe(false);
    expect(isInTheMoney(true, 150, 150)).toBe(false);
  });
  it("needs the price past the strike", () => {
    expect(isInTheMoney(false, 151, 150)).toBe(true);
    expect(isInTheMoney(false, 149, 150)).toBe(false);
    expect(isInTheMoney(true, 149, 150)).toBe(true);
    expect(isInTheMoney(true, 151, 150)).toBe(false);
  });
});

describe("buyStatus", () => {
  it("offers the deposit strictly before expiry", () => {
    expect(buyStatus(call, expiryTs - 1)).toBe("deposit");
    expect(buyStatus(call, expiryTs)).toBe("settling");
  });
  it("ignores a price while the deposit window is open", () => {
    expect(buyStatus({ ...call, settlementPrice1e9: 160 }, expiryTs - 1)).toBe("deposit");
  });
  it.each([
    ["call", call, 160, 140],
    ["put", put, 140, 160],
  ])("resolves an unfunded %s after expiry from the finalized price", (_, facts, itm, otm) => {
    expect(buyStatus({ ...facts, settlementPrice1e9: itm }, expiryTs)).toBe("not_exercised");
    expect(buyStatus({ ...facts, settlementPrice1e9: otm }, expiryTs)).toBe("expired");
    expect(buyStatus({ ...facts, settlementPrice1e9: 150 }, expiryTs)).toBe("expired");
  });
  it.each([
    ["call", call, 160, 140],
    ["put", put, 140, 160],
  ])("keeps a funded %s exercising unless it finalized out of the money", (_, facts, itm, otm) => {
    const funded = { ...facts, state: "funded" as const };
    expect(buyStatus(funded, expiryTs - 1)).toBe("funded");
    expect(buyStatus(funded, expiryTs)).toBe("funded");
    expect(buyStatus({ ...funded, settlementPrice1e9: itm }, expiryTs)).toBe("will_exercise");
    expect(buyStatus({ ...funded, settlementPrice1e9: otm }, expiryTs)).toBe("deposit_returns");
  });
});
