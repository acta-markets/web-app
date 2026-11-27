"use client";

import { ShareCardPanel } from "@/components/share/share-card";
import type { PositionsTableRow } from "@/lib/portfolio-positions";
import { BUY_PRODUCT_NAME, productLabel } from "@/lib/spreads";
import { pnlShareCard, positionShareCard, tradeShareCard, type ShareCard, type TradeShareInput } from "@/lib/share/card";

const NOW = Date.UTC(2026, 10, 16);

const SELL: TradeShareInput = {
  asset: "BTC",
  thesis: "BTC will be above $64,500 on Nov 20",
  side: "sell",
  typeLabel: productLabel("cash_secured_put"),
  aprPct: 36.52,
  premium: "38.72 USDC",
  deposit: "6,450.00 USDC",
  breakEven: null,
  maxGain: null,
  expires: "Nov 20",
  devnet: false,
  nowMs: NOW,
};
const BUY: TradeShareInput = {
  ...SELL,
  thesis: "SOL will be above $150 on Nov 28",
  asset: "SOL",
  side: "buy",
  typeLabel: BUY_PRODUCT_NAME.covered_call,
  aprPct: null,
  premium: "52.10 USDC",
  deposit: null,
  breakEven: "$152.61",
};
const SPREAD: TradeShareInput = {
  ...BUY,
  asset: "TSLA",
  thesis: "TSLA will be below $1,250.50 on Dec 26",
  typeLabel: BUY_PRODUCT_NAME.put_spread,
  breakEven: "$1,231.20",
  maxGain: "1,480.00 USDC",
  devnet: true,
};
const LONG: TradeShareInput = {
  ...SELL,
  asset: "XAU",
  thesis: "XAU will be below $4,125.756789 on Dec 26",
  typeLabel: productLabel("covered_call"),
  deposit: "12.5 XAU",
  premium: "1,204.18 USDC",
  devnet: true,
};
const NO_THESIS: TradeShareInput = { ...SELL, thesis: null, asset: "HYPE", aprPct: null };

const pnl = (realized: number, unrealized: number | null, aprPct: number | null, collectedUsd: number, devnet = false) =>
  pnlShareCard({
    pnl: { realized, unrealized, hasUnrealizedMark: unrealized != null, wins: 3, losses: 1, breakEven: 0, settledCount: realized === 0 ? 0 : 4 },
    apr: { aprPct, collateralUsd: 1000, writtenCount: aprPct == null ? 0 : 2 },
    trading: { collectedUsd, paidUsd: 12, openSells: 2, openBuys: 1, sellCount: collectedUsd > 0 ? 6 : 0, buyCount: 2 },
    devnet,
    nowMs: NOW,
  });

const position = (over: Partial<PositionsTableRow>, devnet = false) =>
  positionShareCard(
    {
      id: "p", symbol: "SOL", sentenceBody: "ends below $150 by Nov 28", sentence: "SOL ends below $150 by Nov 28",
      productLabel: "Covered call", legsText: null, outcome: null, exerciseText: null, strikeText: "$150", markText: "$141.20",
    markNum: 141.2, strikeNum: 150, farStrikeNum: null, cashSettled: false,
      direction: "below", side: "sell", sizeNum: 10, sizeText: "10 SOL", premiumNum: 31.4, premiumLabel: "collected",
      pnlNum: 31.4, pnlText: "+$31.40", expiryTs: Date.UTC(2026, 10, 28, 8) / 1000, isOpen: true, state: "Open",
      createdTs: 0, buy: null, fund: null, inTheMoney: null,
      ...over,
    },
    { devnet, nowMs: NOW },
  );

const CARDS: Array<{ name: string; card: ShareCard; privateCard?: ShareCard }> = [
  { name: "Trade, sold", card: tradeShareCard(SELL, { amounts: true }), privateCard: tradeShareCard(SELL, { amounts: false }) },
  { name: "Trade, bought call", card: tradeShareCard(BUY, { amounts: true }), privateCard: tradeShareCard(BUY, { amounts: false }) },
  { name: "Trade, bought spread, devnet", card: tradeShareCard(SPREAD, { amounts: true }), privateCard: tradeShareCard(SPREAD, { amounts: false }) },
  { name: "Trade, long sentence, devnet", card: tradeShareCard(LONG, { amounts: true }), privateCard: tradeShareCard(LONG, { amounts: false }) },
  { name: "Trade, no sentence, no logo", card: tradeShareCard(NO_THESIS, { amounts: true }) },
  { name: "Position, sold, up", card: position({}) },
  {
    name: "Position, bought call, up",
    card: position({ symbol: "BTC", sentence: "BTC ends above $71,000 by Nov 20", productLabel: "Call", side: "buy", markText: "$74,310", premiumNum: 52.1, premiumLabel: "paid", pnlNum: 278.9, pnlText: "+$278.90" }),
  },
  {
    name: "Position, bought spread, down, devnet",
    card: position(
      { symbol: "TSLA", sentence: "TSLA ends below $1,250.50 by Dec 26", productLabel: "Put spread", legsText: "1,100/1,250.50", side: "buy", markText: "$1,302.15", premiumNum: 220, premiumLabel: "paid", pnlNum: -220, pnlText: "-$220.00" },
      true,
    ),
  },
  { name: "P&L, up", card: pnl(1204.18, 310.4, 24.31, 1630.02) },
  { name: "P&L, down, devnet", card: pnl(-86.5, -12.25, 18.4, 44, true) },
  { name: "P&L, open only", card: pnl(0, 4.5, null, 0) },
  { name: "P&L, eight figures", card: pnl(12_345_678.9, -1_204_555.02, 112.04, 23_456_789.01) },
];

export function ShareGallery() {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-10">
      <h1 className="font-mono text-xl font-medium text-content-primary">Share cards: every kind</h1>
      <p className="mt-1 font-mono text-sm text-content-secondary">Review only. Sample numbers. The buttons work.</p>
      <div className="mt-8 grid grid-cols-1 items-start gap-x-6 gap-y-10 lg:grid-cols-2 2xl:grid-cols-3">
        {CARDS.map(({ name, card, privateCard }) => (
          <section key={name} data-card={name}>
            <h2 className="mb-2 font-mono text-[12px] font-medium text-content-tertiary">{name}</h2>
            <div className="w-full max-w-lg border border-bg-border bg-bg-primary p-6 text-content-primary">
              <ShareCardPanel card={card} privateCard={privateCard} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
