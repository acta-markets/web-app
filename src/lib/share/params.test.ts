import { describe, expect, it } from "vitest";
import type { PositionsTableRow } from "@/lib/portfolio-positions";
import { pnlShareCard, positionShareCard, tradeShareCard, type ShareCard, type TradeShareInput } from "./card";
import { productLabelFor } from "@/lib/portfolio-positions";
import type { PositionInfo } from "@/lib/rfq-client";
import { BUY_PRODUCT_NAME, productLabel, type Product } from "@/lib/spreads";
import { SHARE_PRODUCT_NAMES, decodeShareCard, encodeShareCard, shareImagePath, sharePageUrl } from "./params";

const NOW = Date.UTC(2026, 10, 16, 12);
const sell: TradeShareInput = {
  asset: "BTC", thesis: "BTC will be above $64,500 on Nov 20", side: "sell", typeLabel: "Cash-Secured Put", aprPct: 36.52,
  premium: "38.72 USDC", deposit: "6,450.00 USDC", breakEven: null, maxGain: null, expires: "Nov 20", devnet: false, nowMs: NOW,
};
const row: PositionsTableRow = {
  id: "p1", symbol: "SOL", sentenceBody: "ends below $150 by Nov 28", sentence: "SOL ends below $150 by Nov 28",
  productLabel: "Covered call", legsText: null, outcome: null, exerciseText: null, strikeText: "$150", markText: "$141.20",
    markNum: 141.2, strikeNum: 150, farStrikeNum: null, cashSettled: false,
  direction: "below", side: "sell", sizeNum: 1, sizeText: "1 SOL", premiumNum: 2, premiumLabel: "collected",
  pnlNum: 2, pnlText: "+$2.00", expiryTs: Math.floor(Date.UTC(2026, 10, 28, 8) / 1000), isOpen: true, state: "Open",
  createdTs: 0, buy: null, fund: null, inTheMoney: null,
};

const cards: Array<[string, ShareCard]> = [
  ["a sold trade", tradeShareCard(sell, { amounts: true })],
  ["a trade without amounts", tradeShareCard(sell, { amounts: false })],
  ["a bought spread", tradeShareCard({ ...sell, side: "buy", typeLabel: "Buy a call spread", aprPct: null, deposit: null, breakEven: "$71,521", maxGain: "947.90 USDC" }, { amounts: true })],
  ["a trade with no sentence", tradeShareCard({ ...sell, thesis: null, aprPct: null }, { amounts: true })],
  ["a portfolio", pnlShareCard({
    pnl: { realized: -6, unrealized: 4.5, hasUnrealizedMark: true, wins: 1, losses: 2, breakEven: 0, settledCount: 3 },
    apr: { aprPct: 18.4, collateralUsd: 300, writtenCount: 3 },
    trading: { collectedUsd: 20, paidUsd: 7, openSells: 2, openBuys: 1, sellCount: 5, buyCount: 2 },
    devnet: false, nowMs: NOW,
  })],
  ["a sold position", positionShareCard(row, { devnet: false, nowMs: NOW })],
  ["a bought position", positionShareCard({ ...row, side: "buy", productLabel: "Call", premiumNum: 10, premiumLabel: "paid", pnlNum: 53.5, pnlText: "+$53.50" }, { devnet: false, nowMs: NOW })],
];

/** A card's wire form, for writing a forged one. */
const wire = (card: ShareCard) => JSON.parse(atob(encodeShareCard(card).replace(/-/g, "+").replace(/_/g, "/")));
const forge = (card: ShareCard, change: (w: Record<string, unknown>) => void) => {
  const w = wire(card);
  change(w);
  return btoa(JSON.stringify(w)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

describe("share card in a link", () => {
  it.each(cards)("carries %s there and back unchanged", (_name, card) => {
    const back = decodeShareCard(encodeShareCard(card), { tag: null });
    expect(back).not.toBeNull();
    expect(back).toMatchObject({
      eyebrow: card.eyebrow, asset: card.asset, title: card.title, titleKind: card.titleKind, titleTone: card.titleTone,
      caption: card.caption, stats: card.stats, date: card.date, alt: card.alt,
    });
    expect(encodeShareCard(card)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("knows every product name the app can put on a card", () => {
    const products: Product[] = ["covered_call", "cash_secured_put", "cash_put", "call_spread", "put_spread"];
    for (const type of products) {
      expect(SHARE_PRODUCT_NAMES.has(productLabel(type)), productLabel(type)).toBe(true);
      expect(SHARE_PRODUCT_NAMES.has(BUY_PRODUCT_NAME[type]), BUY_PRODUCT_NAME[type]).toBe(true);
      for (const side of ["buy", "sell"] as const) {
        const name = productLabelFor({ side, terms: { type } } as unknown as PositionInfo);
        expect(SHARE_PRODUCT_NAMES.has(name), name).toBe(true);
      }
    }
  });

  it("takes the Devnet tag from whoever reads the link, never from the link", () => {
    const devnetCard = tradeShareCard({ ...sell, devnet: true }, { amounts: true });
    expect(decodeShareCard(encodeShareCard(devnetCard), { tag: null })?.tag).toBeNull();
    const mainnetCard = tradeShareCard(sell, { amounts: true });
    const read = decodeShareCard(encodeShareCard(mainnetCard), { tag: "Devnet" });
    expect(read?.tag).toBe("Devnet");
    expect(read?.alt).toMatch(/Devnet test funds$/);
  });

  it("refuses a card that carries words of its own", () => {
    const [, trade] = cards[0];
    const [, portfolio] = cards[4];
    const [, position] = cards[5];
    const forged = [
      forge(trade, (w) => { w.e = "Acta is a scam"; }),
      forge(trade, (w) => { w.t = "Send your keys to this address today"; }),
      forge(trade, (w) => { w.t = "BTC will be above $64,500 on Nov 20 <script>"; }),
      forge(trade, (w) => { (w.s as unknown[][])[0][0] = "Guaranteed"; }),
      forge(trade, (w) => { (w.s as unknown[][])[1][1] = "free money"; }),
      forge(trade, (w) => { w.s = [["Type", "Guaranteed profit"]]; }),
      forge(trade, (w) => { w.a = "../../etc"; }),
      forge(trade, (w) => { w.d = "Call this number"; }),
      forge(portfolio, (w) => { w.t = "+$1 million guaranteed"; }),
      forge(position, (w) => { w.c = "Anything at all"; }),
      forge(portfolio, (w) => { w.s = Array.from({ length: 5 }, () => ["APR", "1%"]); }),
      forge(portfolio, (w) => { w.n = "blink"; }),
    ];
    for (const c of forged) expect(decodeShareCard(c, { tag: null })).toBeNull();
    for (const c of [null, undefined, "", "not base64 !!", "e30", "x".repeat(3000)]) expect(decodeShareCard(c, { tag: null })).toBeNull();
  });

  it("lets a made-up number through, which is why the card says where it came from and not that it is verified", () => {
    const [, portfolio] = cards[4];
    const inflated = forge(portfolio, (w) => { w.t = "+$9,999,999.00"; });
    expect(decodeShareCard(inflated, { tag: null })?.title).toBe("+$9,999,999.00");
  });

  it("builds the image address and the page a post links to, keeping the referral code", () => {
    const [, card] = cards[0];
    expect(shareImagePath(card)).toBe(`/share/card?c=${encodeShareCard(card)}`);
    expect(shareImagePath(card, 2)).toBe(`/share/card?c=${encodeShareCard(card)}&s=2`);
    const page = new URL(sharePageUrl("https://beta.acta.markets/?ref=TIM", card));
    expect(page.origin + page.pathname).toBe("https://beta.acta.markets/share");
    expect(page.searchParams.get("ref")).toBe("TIM");
    expect(page.searchParams.get("c")).toBe(encodeShareCard(card));
  });
});
