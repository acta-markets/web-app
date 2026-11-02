import { describe, expect, it } from "vitest";
import {
  depositSymbol,
  directionInfo,
  easyCta,
  isRight,
  cushionText,
  outcomeCopy,
  scenario,
  strikeDistancePct,
  thesisText,
  zoneLabels,
  type EasyCtaState,
} from "./thesis";

const nov7 = Date.UTC(2026, 10, 7, 8);

describe("direction mapping", () => {
  it("sells a cash-secured put for above and a covered call for below", () => {
    expect(directionInfo("above")).toMatchObject({ positionType: "cash_secured_put", isPut: true });
    expect(directionInfo("below")).toMatchObject({ positionType: "covered_call", isPut: false });
    expect(depositSymbol("above", "SOL")).toBe("USDC");
    expect(depositSymbol("below", "SOL")).toBe("SOL");
  });

  it("settles ties in the user's favour, like the contract", () => {
    expect(isRight("above", 150, 150)).toBe(true);
    expect(isRight("above", 149.99, 150)).toBe(false);
    expect(isRight("below", 170, 170)).toBe(true);
    expect(isRight("below", 170.01, 170)).toBe(false);
  });

  it("states the thesis on the UTC expiry day", () => {
    expect(thesisText({ asset: "SOL", direction: "above", strike: 150, expiryMs: nov7 })).toBe(
      "SOL will be above $150 on Nov 7"
    );
    expect(strikeDistancePct(150, 160)).toBeCloseTo(-6.25);
    expect(strikeDistancePct(150, null)).toBeNull();
  });
});

describe("scenario", () => {
  it("prices a put: USDC locked at the strike, break-even below it", () => {
    const s = scenario({ direction: "above", quantity: 6.6, strike: 150, premiumPerUnit: 1.23, spot: 160 });
    expect(s.deposit).toBeCloseTo(990);
    expect(s.premium).toBeCloseTo(8.118);
    expect(s.returnPct).toBeCloseTo(0.82);
    expect(s.breakEven).toBeCloseTo(148.77);
    expect(s.converted).toBeCloseTo(6.6);
  });

  it("prices a call: the asset locked, break-even above the strike", () => {
    const s = scenario({ direction: "below", quantity: 6.25, strike: 170, premiumPerUnit: 1.248, spot: 160 });
    expect(s.deposit).toBe(6.25);
    expect(s.depositUsd).toBeCloseTo(1000);
    expect(s.premium).toBeCloseTo(7.8);
    expect(s.returnPct).toBeCloseTo(0.78);
    expect(s.breakEven).toBeCloseTo(171.248);
    expect(s.converted).toBeCloseTo(1062.5);
    expect(scenario({ direction: "below", quantity: 1, strike: 170, premiumPerUnit: 1, spot: null }).returnPct).toBeNull();
  });

  it("spells out both outcomes, risk included", () => {
    const put = outcomeCopy({
      asset: "SOL", direction: "above", strike: 150,
      scenario: scenario({ direction: "above", quantity: 6.6, strike: 150, premiumPerUnit: 1.25, spot: 160 }),
    });
    expect(put.right.when).toBe("If SOL ends at or above $150");
    expect(put.right.result).toBe("You get your 990.00 USDC back and keep the 8.25 USDC premium.");
    expect(put.wrong.result).toBe("Your 990.00 USDC buys 6.6 SOL at $150. You keep the 8.25 USDC premium.");
    expect(put.wrong.note).toBe("Below $148.75 you are down compared with holding USDC.");

    const call = outcomeCopy({
      asset: "SOL", direction: "below", strike: 170,
      scenario: scenario({ direction: "below", quantity: 6.25, strike: 170, premiumPerUnit: 1.25, spot: 160 }),
    });
    expect(call.right.when).toBe("If SOL ends at or below $170");
    expect(call.right.note).toBe("You still hold SOL, so a falling price still costs you.");
    expect(call.wrong.result).toBe("Your 6.25 SOL is sold for 1,062.50 USDC at $170. You keep the 7.81 USDC premium.");
    expect(call.wrong.note).toBe("Above $171.25 you would have done better holding SOL.");
  });
});

describe("cushion sentence", () => {
  it("gives the room left when the thesis holds today", () => {
    // strike 1.5% under spot, thesis "above": right unless it falls more than 1.5%
    expect(cushionText("SOL", "above", -1.5)).toBe("SOL can fall 1.5% and you're still right.");
    // strike 3.4% over spot, thesis "below": right unless it rises more than 3.4%
    expect(cushionText("SOL", "below", 3.44)).toBe("SOL can rise 3.4% and you're still right.");
  });

  it("gives the move needed when it does not hold yet", () => {
    expect(cushionText("SOL", "above", 4.8)).toBe("SOL has to rise 4.8% for you to be right.");
    expect(cushionText("SOL", "below", -2)).toBe("SOL has to fall 2.0% for you to be right.");
  });

  it("handles a price at spot and a missing spot", () => {
    expect(cushionText("SOL", "above", 0.03)).toBe("SOL is right at your price today.");
    expect(cushionText("SOL", "below", null)).toBeNull();
  });
});

describe("chart zone labels", () => {
  it("name what the user ends with, generic until an amount is set", () => {
    const put = scenario({ direction: "above", quantity: 1.1, strike: 95, premiumPerUnit: 1, spot: 100 });
    expect(zoneLabels({ asset: "SOL", direction: "above", strike: 95, scenario: put })).toEqual({
      right: { title: "Keep 104.50 USDC", premium: "1.10 USDC" },
      wrong: { title: "Buy 1.1 SOL at $95", premium: "1.10 USDC" },
    });
    const call = scenario({ direction: "below", quantity: 2, strike: 105, premiumPerUnit: 1, spot: 100 });
    expect(zoneLabels({ asset: "SOL", direction: "below", strike: 105, scenario: call }).wrong.title).toBe("Sold for 210.00 USDC");
    expect(zoneLabels({ asset: "SOL", direction: "below", strike: 105, scenario: null })).toEqual({
      right: { title: "Keep your SOL", premium: null },
      wrong: { title: "Sell SOL at $105", premium: null },
    });
  });
});

describe("call to action", () => {
  const ready: EasyCtaState = {
    walletConnected: true, referralGated: false, pricesLoading: false, hasMarkets: true, hasStrike: true,
    priced: true, amountEntered: true, sizeViolation: null, insufficientBalance: false, connecting: false,
    requesting: false,
  };

  it("enables a quote only when everything is in place", () => {
    expect(easyCta(ready)).toEqual({ label: "Get quote", action: "quote" });
  });

  it.each([
    [{ walletConnected: false }, "Connect wallet", "connect"],
    [{ referralGated: true }, "Redeem invite to trade", "redeem"],
    [{ pricesLoading: true }, "Loading prices...", null],
    [{ hasMarkets: false }, "No markets right now", null],
    [{ hasStrike: false }, "Choose a price", null],
    [{ priced: false }, "Prices unavailable", null],
    [{ amountEntered: false }, "Enter an amount", null],
    [{ sizeViolation: "Below min 15 USDC" }, "Below min 15 USDC", null],
    [{ insufficientBalance: true }, "Insufficient balance", null],
    [{ connecting: true }, "Connecting...", null],
    [{ requesting: true }, "Getting quote...", null],
  ] as const)("%o → %s", (patch, label, action) => {
    expect(easyCta({ ...ready, ...patch })).toEqual({ label, action });
  });

  it("asks for a wallet before anything else", () => {
    expect(easyCta({ ...ready, walletConnected: false, pricesLoading: true, priced: false }).label).toBe("Connect wallet");
  });
});
