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
  outcomeCopy,
  scenario,
  strikeDistancePct,
  tradeLine,
  tradeLineText,
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

describe("the sentence's second line", () => {
  it("says what a sold option earns and what being wrong does to the deposit", () => {
    // thesis "above" sells a put: wrong, the USDC buys the asset at the strike
    expect(tradeLineText({ asset: "SOL", direction: "above", side: "sell", strike: "$150", premium: "\u2248$1.10" })).toBe(
      "You're selling a put to earn \u2248$1.10, and buy SOL at $150 if wrong"
    );
    // thesis "below" sells a call: wrong, the asset is sold at the strike
    expect(tradeLineText({ asset: "SOL", direction: "below", side: "sell", strike: "$170", premium: "\u2248$1.10" })).toBe(
      "You're selling a call to earn \u2248$1.10, and sell your SOL at $170 if wrong"
    );
  });

  it("keeps a sold option's wrong outcome when it has no price yet", () => {
    expect(tradeLineText({ asset: "SOL", direction: "above", side: "sell", strike: "$150" })).toBe(
      "You're selling a put, and buy SOL at $150 if wrong"
    );
  });

  it("names a bought option's strike, what it makes if right, and that its price is all it risks", () => {
    expect(
      tradeLineText({ asset: "BTC", direction: "above", side: "buy", strike: "$61,000", premium: "\u2248$21.73", goalProfit: "+$28.27" })
    ).toBe("You're buying a $61,000 call to make +$28.27 or more, risking \u2248$21.73");
    expect(
      tradeLineText({ asset: "BTC", direction: "below", side: "buy", strike: "$60,000", premium: "\u2248$21.73", goalProfit: "+$128" })
    ).toBe("You're buying a $60,000 put to make +$128 or more, risking \u2248$21.73");
    // priced, but no goal to measure a profit at
    expect(tradeLineText({ asset: "BTC", direction: "above", side: "buy", strike: "$61,000", premium: "\u2248$21.73" })).toBe(
      "You're buying a $61,000 call, risking \u2248$21.73"
    );
    // unpriced, the same promise in words; a profit with no price to set it against is not shown
    expect(tradeLineText({ asset: "BTC", direction: "above", side: "buy", strike: "$61,000", goalProfit: "+$28.27" })).toBe(
      "You're buying a $61,000 call, risking what you pay for it"
    );
  });

  it("still names the option without a strike, so the line's switch is always there", () => {
    expect(tradeLineText({ asset: "SOL", direction: "below", side: "sell", strike: null, premium: "\u2248$1.10" })).toBe("You're selling a call");
    expect(tradeLineText({ asset: "BTC", direction: "above", side: "buy", strike: null })).toBe(
      "You're buying a call, risking what you pay for it"
    );
  });

  it("splits the line around its two controls: the verb, and a buy's strike", () => {
    expect(
      tradeLine({ asset: "BTC", direction: "above", side: "buy", strike: "$61,000", premium: "\u2248$21.73", goalProfit: "+$28.27" })
    ).toEqual({
      lead: "You're",
      verb: "buying",
      before: "a",
      strike: "$61,000",
      rest: "call to make +$28.27 or more, risking \u2248$21.73",
    });
    // a sell's strike is the first line's price; here it is plain text inside the rest
    const sell = tradeLine({ asset: "BTC", direction: "above", side: "sell", strike: "$60,000" });
    expect(sell.verb).toBe("selling");
    expect(sell.strike).toBeUndefined();
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
    [{ walletConnected: false }, "Connect wallet to trade", "connect"],
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
    expect(easyCta({ ...ready, walletConnected: false, pricesLoading: true, priced: false }).label).toBe("Connect wallet to trade");
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
    expect(buyZoneLabels({ asset: "SOL", direction: "below", strike: 150 }).wrong.title).toBe("SOL above $150 — you lose premium");
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
    expect(buySpreadTerms(false, 100e9, 110e9)).toEqual({ type: "call_spread", lower_strike: "100000000000", upper_strike: "110000000000" });
    expect(buySpreadTerms(true, 100e9, 90e9)).toEqual({ type: "put_spread", lower_strike: "90000000000", upper_strike: "100000000000" });
    expect(buySpreadTerms(true, 100e9, 0)).toEqual({ type: "cash_put", strike: "100000000000" });
  });

  it("reads the legs back from the terms and refuses physical terms", () => {
    expect(spreadBounds({ type: "cash_put", strike: "100000000000" })).toEqual({ lower: 0, upper: 100e9 });
    expect(spreadBounds({ type: "put_spread", lower_strike: "90000000000", upper_strike: "100000000000" })).toEqual({ lower: 90e9, upper: 100e9 });
    expect(spreadBounds({ type: "covered_call", strike: "100000000000" })).toBeNull();
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
    expect(spreadZoneLabels(null).wrong.title).toBe("You lose premium");
  });

  it("names the leg and says what can come back", () => {
    expect(spreadLegLabel(false, 110e9)).toBe("Up to $110");
    expect(spreadLegLabel(true, 90e9)).toBe("Down to $90");
    expect(spreadLegLabel(true, 0)).toBe("To $0 (cash put)");
    const copy = spreadOutcomeCopy({ asset: "SOL", direction: "above", strike1e9: 100e9, leg1e9: 110e9, maxPayout: "$20" });
    expect(copy.right.result).toContain("up to $20");
    expect(copy.right.note).toContain("Nothing to fund");
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

describe("zoneLabels with fixed decimals", () => {
  it("keeps the amount the same length as it changes, so the ticker after it holds still", () => {
    const scenario = (converted: number) => ({ deposit: converted * 95, converted, premium: 1 }) as Parameters<typeof zoneLabels>[0]["scenario"];
    const title = (converted: number) =>
      zoneLabels({ asset: "SOL", direction: "above", strike: 95, scenario: scenario(converted), assetDecimals: 4, fixedDecimals: true }).wrong.title;
    expect(title(0.1)).toBe("Buy 0.1000 SOL at $95");
    expect(title(0.1004)).toBe("Buy 0.1004 SOL at $95");
    expect(title(0.1).length).toBe(title(0.1004).length);
    // without the option the amount is as short as it can be, as before
    expect(zoneLabels({ asset: "SOL", direction: "above", strike: 95, scenario: scenario(0.1) }).wrong.title).toBe("Buy 0.1 SOL at $95");
  });
});
