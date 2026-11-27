import { describe, expect, it } from "vitest";
import type { PositionsTableRow } from "@/lib/portfolio-positions";
import { hasShareablePnl, hasShareablePosition, pnlShareCard, positionShareCard, tradeShareCard, type TradeShareInput } from "./card";

const NOW = Date.UTC(2026, 10, 16, 12);

const sell: TradeShareInput = {
  asset: "BTC",
  thesis: "BTC will be above $64,500 on Nov 20",
  side: "sell",
  typeLabel: "Cash-secured put",
  aprPct: 36.519,
  premium: "38.72 USDC",
  deposit: "6,450.00 USDC",
  breakEven: null,
  maxGain: null,
  expires: "Nov 20",
  devnet: false,
  nowMs: NOW,
};
const buy: TradeShareInput = { ...sell, side: "buy", typeLabel: "Call spread", aprPct: null, deposit: null, premium: "52.10 USDC", breakEven: "$71,521", maxGain: "947.90 USDC" };

const labels = (card: { stats: readonly { label: string }[] }) => card.stats.map((s) => s.label);

describe("tradeShareCard", () => {
  it("leads a sold option with the user's view and its rate", () => {
    const card = tradeShareCard(sell, { amounts: true });
    expect(card.eyebrow).toBe("I believe");
    expect(card.title).toBe("BTC will be above $64,500 on Nov 20");
    expect(card.stats).toEqual([
      { label: "APR", value: "36.52%", tone: "up" },
      { label: "Premium earned", value: "38.72 USDC" },
      { label: "Deposit", value: "6,450.00 USDC" },
    ]);
    expect(card.text).toBe("I believe BTC will be above $64,500 on Nov 20. Earning 36.52% APR on Acta.");
    expect(card.date).toBe("Nov 16, 2026");
    expect(card.tag).toBeNull();
  });

  it("without amounts shows nothing that gives away the size of the trade", () => {
    const sold = tradeShareCard(sell, { amounts: false });
    expect(labels(sold)).toEqual(["APR", "Type"]);
    const bought = tradeShareCard(buy, { amounts: false });
    expect(labels(bought)).toEqual(["Break-even", "Type"]);
    for (const card of [sold, bought]) {
      expect(JSON.stringify(card)).not.toMatch(/38\.72|6,450|52\.10|947\.90/);
    }
  });

  it("shows a bought option's break-even, what it can make and what it cost", () => {
    expect(tradeShareCard(buy, { amounts: true }).stats).toEqual([
      { label: "Break-even", value: "$71,521" },
      { label: "Max gain", value: "947.90 USDC", tone: "up" },
      { label: "Premium paid", value: "52.10 USDC" },
    ]);
  });

  it("marks a devnet trade as test funds on the card, in its alt text and in the post", () => {
    const card = tradeShareCard({ ...sell, devnet: true }, { amounts: true });
    expect(card.tag).toBe("Devnet");
    expect(card.alt).toMatch(/Devnet test funds$/);
    expect(card.text).toMatch(/\(devnet\)$/);
  });

  it("names the trade when it has no sentence, and then says when it expires", () => {
    const card = tradeShareCard({ ...sell, thesis: null, aprPct: null }, { amounts: true });
    expect(card.eyebrow).toBe("My trade");
    expect(card.title).toBe("BTC cash-secured put");
    expect(labels(card)).toEqual(["Premium earned", "Deposit", "Expires"]);
  });
});

describe("pnlShareCard", () => {
  const base = {
    apr: { aprPct: 18.4, collateralUsd: 300, writtenCount: 3 },
    trading: { collectedUsd: 20, paidUsd: 7, openSells: 2, openBuys: 1, sellCount: 5, buyCount: 2 },
    devnet: false,
    nowMs: NOW,
  };

  it("heads the card with net P&L, toned, over the page's own figures", () => {
    const card = pnlShareCard({ ...base, pnl: { realized: -6, unrealized: 4.5, hasUnrealizedMark: true, wins: 1, losses: 2, breakEven: 0, settledCount: 3 } });
    expect(card.title).toBe("-$1.50");
    expect(card.titleTone).toBe("down");
    expect(card.stats).toEqual([
      { label: "Realised", value: "-$6.00", tone: "down" },
      { label: "Unrealised", value: "+$4.50", tone: "up" },
      { label: "APR", value: "18.40%" },
      { label: "Premium collected", value: "$20.00" },
    ]);
    expect(card.text).toBe("My net P&L on Acta: -$1.50");
  });

  it("leaves out a figure the portfolio does not have", () => {
    const card = pnlShareCard({
      pnl: { realized: 0, unrealized: 4.5, hasUnrealizedMark: true, wins: 0, losses: 0, breakEven: 0, settledCount: 0 },
      apr: { aprPct: null, collateralUsd: 0, writtenCount: 0 },
      trading: { collectedUsd: 0, paidUsd: 7, openSells: 0, openBuys: 1, sellCount: 0, buyCount: 1 },
      devnet: true,
      nowMs: NOW,
    });
    expect(labels(card)).toEqual(["Unrealised"]);
    expect(card.tag).toBe("Devnet");
  });

  it("has nothing to share before anything has closed or been marked", () => {
    const empty = { realized: 0, unrealized: null, hasUnrealizedMark: false, wins: 0, losses: 0, breakEven: 0, settledCount: 0 };
    expect(hasShareablePnl(empty)).toBe(false);
    expect(hasShareablePnl({ ...empty, settledCount: 1 })).toBe(true);
    expect(hasShareablePnl({ ...empty, unrealized: 2, hasUnrealizedMark: true })).toBe(true);
  });
});

describe("positionShareCard", () => {
  const row = (over: Partial<PositionsTableRow> = {}): PositionsTableRow => ({
    id: "p1", symbol: "SOL", sentenceBody: "ends below $150 by Nov 28", sentence: "SOL ends below $150 by Nov 28",
    productLabel: "Covered call", legsText: null, outcome: null, exerciseText: null, strikeText: "$150", markText: "$140.00",
    markNum: 140.0, strikeNum: 150, farStrikeNum: null, cashSettled: false,
    direction: "below", side: "sell", sizeNum: 1, sizeText: "1 SOL", premiumNum: 2, premiumLabel: "collected",
    pnlNum: 2, pnlText: "+$2.00", expiryTs: Math.floor(Date.UTC(2026, 10, 28, 8) / 1000), isOpen: true, state: "Open",
    createdTs: 0, buy: null, fund: null, inTheMoney: null,
    ...over,
  });

  it("heads a sold position with its unrealised P&L and says what the position is", () => {
    const card = positionShareCard(row(), { devnet: false, nowMs: NOW });
    expect(card.eyebrow).toBe("Unrealised P&L");
    expect(card.title).toBe("+$2.00");
    expect(card.titleTone).toBe("up");
    expect(card.caption).toBe("SOL ends below $150 by Nov 28");
    expect(card.stats).toEqual([
      { label: "Type", value: "Covered call" },
      { label: "Now", value: "$140.00" },
      { label: "Premium collected", value: "$2.00" },
      { label: "Expires", value: "Nov 28" },
    ]);
    expect(card.text).toBe("SOL ends below $150 by Nov 28. Unrealised P&L +$2.00 on Acta.");
  });

  it("gives a bought position its return on the premium paid", () => {
    const card = positionShareCard(
      row({ side: "buy", productLabel: "Call spread", legsText: "150/180", premiumNum: 10, premiumLabel: "paid", pnlNum: -4, pnlText: "-$4.00" }),
      { devnet: true, nowMs: NOW },
    );
    expect(card.titleTone).toBe("down");
    expect(card.stats).toEqual([
      { label: "Type", value: "Call spread" },
      { label: "Now", value: "$140.00" },
      { label: "Premium paid", value: "$10.00" },
      { label: "Return", value: "-40.0%", tone: "down" },
    ]);
    expect(card.tag).toBe("Devnet");
    expect(card.text).toMatch(/\(devnet\)$/);
  });

  it("is only for an open position that could be priced", () => {
    expect(hasShareablePosition(row())).toBe(true);
    expect(hasShareablePosition(row({ pnlNum: null, pnlText: "\u2014" }))).toBe(false);
    expect(hasShareablePosition(row({ isOpen: false }))).toBe(false);
  });
});
