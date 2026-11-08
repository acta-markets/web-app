import { describe, expect, it } from "vitest";
import { formatUsdc } from "@/lib/trade/format";
import {
  amountSymbol,
  buyBreakEven,
  buyOutcomeCopy,
  buySpreadTerms,
  buyZoneLabels,
  depositSymbol,
  directionInfo,
  easyCta,
  exerciseDepositText,
  isRight,
  spreadBounds,
  spreadBreakEven,
  spreadLegLabel,
  spreadLegs,
  spreadMaxGain,
  spreadOutcomeCopy,
  spreadZoneLabels,
  STRATEGIES,
  strategyInfo,
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
    expect(cushionText("SOL", "above", 0.03)).toBe("SOL is right at the strike today.");
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
    [{ hasStrike: false }, "Choose a strike", null],
    [{ priced: false }, "Premium unavailable", null],
    [{ amountEntered: false }, "Enter a size", null],
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

describe("buying", () => {
  it("maps a view onto the option that pays when it holds", () => {
    expect(directionInfo("above", "buy")).toMatchObject({ positionType: "covered_call", isPut: false });
    expect(directionInfo("below", "buy")).toMatchObject({ positionType: "cash_secured_put", isPut: true });
    expect(directionInfo("above")).toMatchObject({ positionType: "cash_secured_put", isPut: true });
    expect(directionInfo("below", "sell")).toMatchObject({ positionType: "covered_call", isPut: false });
  });

  it("counts the amount in the asset when buying, in the deposit when selling", () => {
    expect(amountSymbol("buy", "above", "SOL")).toBe("SOL");
    expect(amountSymbol("buy", "below", "SOL")).toBe("SOL");
    expect(amountSymbol("sell", "above", "SOL")).toBe("USDC");
    expect(amountSymbol("sell", "below", "SOL")).toBe("SOL");
  });

  it("moves break-even past the strike by the gross premium", () => {
    expect(buyBreakEven(false, 150, 5)).toBe(155);
    expect(buyBreakEven(true, 150, 5)).toBe(145);
  });

  it("asks for USDC to exercise a call and the asset for a put", () => {
    expect(exerciseDepositText(false, 2, 150, "SOL")).toBe(formatUsdc(300));
    expect(exerciseDepositText(true, 2, 150, "SOL")).toBe("2 SOL");
  });

  it("puts a tie on the expiring side, as settlement does", () => {
    const above = buyOutcomeCopy({ asset: "SOL", direction: "above", strike: 150, sizeText: "1 SOL" });
    expect(above.right.when).toBe("If SOL ends above $150");
    expect(above.wrong.when).toBe("If SOL ends at or below $150");
    expect(above.right.result).toContain("buy 1 SOL at $150");
    const below = buyOutcomeCopy({ asset: "SOL", direction: "below", strike: 150, sizeText: "1 SOL" });
    expect(below.right.when).toBe("If SOL ends below $150");
    expect(below.wrong.when).toBe("If SOL ends at or above $150");
    expect(below.right.result).toContain("sell 1 SOL at $150");
  });

  it("labels the chart zones without a kept premium", () => {
    expect(buyZoneLabels({ asset: "SOL", direction: "above", strike: 150 }).right).toEqual({ title: "SOL above $150 — profit", premium: null, kept: false });
    expect(buyZoneLabels({ asset: "SOL", direction: "below", strike: 150 }).right.title).toBe("SOL below $150 — profit");
    expect(buyZoneLabels({ asset: "SOL", direction: "below", strike: 150 }).wrong.title).toBe("SOL above $150 — premium lost");
    expect(buyZoneLabels({ asset: "SOL", direction: "below", strike: 150 }).wrong.premium).toBeNull();
  });
});

describe("bought spreads", () => {
  const ladder = [90e9, 95e9, 100e9, 105e9, 110e9, 115e9, 120e9];

  it("offers the nearest higher strikes on a call and never a naked call", () => {
    expect(spreadLegs(ladder, 100e9, false)).toEqual([105e9, 110e9, 115e9]);
    expect(spreadLegs(ladder, 120e9, false)).toEqual([]);
    expect(spreadLegs(ladder, 100e9, false)).not.toContain(0);
  });

  it("offers lower strikes on a put and a cash put down to zero", () => {
    expect(spreadLegs(ladder, 100e9, true)).toEqual([95e9, 90e9, 0]);
    expect(spreadLegs([100e9], 100e9, true)).toEqual([0]);
  });

  it("builds the wire terms of each product", () => {
    expect(buySpreadTerms(false, 100e9, 110e9)).toEqual({ type: "call_spread", lower_strike: 100e9, upper_strike: 110e9 });
    expect(buySpreadTerms(true, 100e9, 90e9)).toEqual({ type: "put_spread", lower_strike: 90e9, upper_strike: 100e9 });
    expect(buySpreadTerms(true, 100e9, 0)).toEqual({ type: "cash_put", strike: 100e9 });
  });

  it("reads the legs back from the terms and refuses physical terms", () => {
    expect(spreadBounds({ type: "cash_put", strike: 100e9 })).toEqual({ lower: 0, upper: 100e9 });
    expect(spreadBounds({ type: "put_spread", lower_strike: 90e9, upper_strike: 100e9 })).toEqual({ lower: 90e9, upper: 100e9 });
    expect(spreadBounds({ type: "covered_call", strike: 100e9 })).toBeNull();
  });

  it("caps the gain at the width and breaks even past the near strike by the premium", () => {
    expect(spreadMaxGain(2, 100e9, 110e9)).toBe(20);
    expect(spreadMaxGain(2, 100e9, 0)).toBe(200);
    expect(spreadBreakEven(false, 100, 3)).toBe(103);
    expect(spreadBreakEven(true, 100, 3)).toBe(97);
  });

  it("labels the chart with cash, never with the asset", () => {
    expect(spreadZoneLabels("20.00 USDC").right).toEqual({ title: "Up to 20.00 USDC", premium: null, kept: false });
    expect(spreadZoneLabels(null).right.title).toBe("Cash payoff");
    expect(spreadZoneLabels(null).wrong.title).toBe("Premium lost");
  });

  it("names the leg and says what can come back", () => {
    expect(spreadLegLabel(false, 110e9)).toBe("Up to $110");
    expect(spreadLegLabel(true, 90e9)).toBe("Down to $90");
    expect(spreadLegLabel(true, 0)).toBe("To $0 (cash put)");
    const copy = spreadOutcomeCopy({ asset: "SOL", direction: "above", strike1e9: 100e9, leg1e9: 110e9, maxPayout: "$20" });
    expect(copy.right.result).toContain("up to $20");
    expect(copy.right.note).toContain("No deposit");
    expect(copy.wrong.note).toBe("You lose the premium.");
  });
});

describe("strategies", () => {
  it("maps each side and direction to exactly one strategy", () => {
    const pairs = STRATEGIES.map((s) => {
      const i = strategyInfo(s);
      return `${i.side}:${i.direction}`;
    });
    expect(new Set(pairs).size).toBe(STRATEGIES.length);
    expect(pairs).toContain("buy:above");
    expect(pairs).toContain("buy:below");
    expect(pairs).toContain("sell:above");
    expect(pairs).toContain("sell:below");
  });

  it("trades the physical market each strategy names", () => {
    expect(strategyInfo("buy_call")).toMatchObject({ side: "buy", direction: "above", positionType: "covered_call", isPut: false });
    expect(strategyInfo("buy_put")).toMatchObject({ side: "buy", direction: "below", positionType: "cash_secured_put", isPut: true });
    expect(strategyInfo("sell_put")).toMatchObject({ side: "sell", direction: "above", positionType: "cash_secured_put", isPut: true });
    expect(strategyInfo("sell_call")).toMatchObject({ side: "sell", direction: "below", positionType: "covered_call", isPut: false });
  });

  it("labels every tile and its descriptor", () => {
    for (const s of STRATEGIES) {
      const i = strategyInfo(s);
      expect(i.label).toMatch(/^(Buy|Sell) a (call|put)$/);
      expect(i.short.length).toBeGreaterThan(0);
      expect(i.arrow).toMatch(/^[↗↘]$/);
    }
  });

  it("carries the strategy label onto the actionable CTA", () => {
    const base = {
      walletConnected: true, referralGated: false, pricesLoading: false, hasMarkets: true, hasStrike: true,
      priced: true, amountEntered: true, sizeViolation: null, insufficientBalance: false,
      connecting: false, requesting: false,
    } as const;
    expect(easyCta({ ...base, ctaLabel: "Buy a call" })).toEqual({ label: "Buy a call", action: "quote" });
    expect(easyCta(base)).toEqual({ label: "Get quote", action: "quote" });
  });
});
