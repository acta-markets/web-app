import { formatUsdSmart } from "@/lib/markets";
import { formatSignedUsd, type OpenWrittenApr, type PnlSummary, type TradingStats } from "@/lib/portfolio-pnl";

export type ShareTone = "up" | "down" | "plain";

export type ShareStat = { label: string; value: string; tone?: ShareTone };

/**
 * Everything a share card says, already in display form. The same object is drawn into the
 * image (`render.ts`), read out as the image's alt text and turned into the words of the post,
 * so the three cannot disagree.
 */
export type ShareCard = {
  /** the small line over the title: "I believe", "Net P&L" */
  eyebrow: string;
  /** the asset whose logo sits beside the eyebrow; null when the card is not about one asset */
  asset: string | null;
  /** the one big line: the user's view in words, or the headline figure */
  title: string;
  /** a sentence is set in the display face and may wrap; a figure is set in mono on one line */
  titleKind: "sentence" | "figure";
  titleTone: ShareTone;
  /** up to four labelled figures under the title */
  stats: readonly ShareStat[];
  /** a corner tag that qualifies the whole card, e.g. "Devnet" for test funds */
  tag: string | null;
  /** the day the card was made, e.g. "Nov 16, 2026" */
  date: string;
  /** the card in words, for the image's alt text */
  alt: string;
  /** the words of the post that goes with the image */
  text: string;
  /** the saved file's name, without extension */
  filename: string;
};

/** The sharer's own day: a card made late on the 16th must not say the 15th because UTC has not turned yet. */
const DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Test funds are not real money: a card made on devnet says so in its corner and in its words. */
export const DEVNET_TAG = "Devnet";

function altText(card: Pick<ShareCard, "eyebrow" | "title" | "stats" | "tag">): string {
  const lead = `${card.eyebrow} ${card.title}`;
  const stats = card.stats.map((s) => `${s.label} ${s.value}`).join(", ");
  return [lead, stats, card.tag ? `${card.tag} test funds` : null].filter(Boolean).join(". ");
}

export type TradeShareInput = {
  asset: string;
  /** the user's view in words, e.g. "BTC will be above $71,000 on Nov 20"; null when the trade has none */
  thesis: string | null;
  side: "buy" | "sell";
  /** the product's name, e.g. "Cash-secured put" */
  typeLabel: string;
  /** annualised premium over the deposit, for a sold option */
  aprPct: number | null;
  /** the premium earned or paid, with its unit */
  premium: string | null;
  /** the deposit behind a sold option, with its unit */
  deposit: string | null;
  breakEven: string | null;
  /** the most a bought spread can make, after its premium */
  maxGain: string | null;
  /** the expiry day, e.g. "Nov 20"; shown only when the thesis does not already say it */
  expires: string | null;
  devnet: boolean;
  nowMs: number;
};

/**
 * The card for a trade that was just confirmed. `amounts: false` leaves out everything that
 * gives away the size of the trade (premium, deposit, max gain) and keeps what does not: the
 * view, the rate, the break-even price.
 */
export function tradeShareCard(input: TradeShareInput, { amounts }: { amounts: boolean }): ShareCard {
  const selling = input.side === "sell";
  const stats: ShareStat[] = [];
  if (selling) {
    if (input.aprPct != null) stats.push({ label: "APR", value: `${input.aprPct.toFixed(2)}%`, tone: "up" });
    if (amounts && input.premium) stats.push({ label: "Premium earned", value: input.premium });
    if (amounts && input.deposit) stats.push({ label: "Deposit", value: input.deposit });
  } else {
    if (input.breakEven) stats.push({ label: "Break-even", value: input.breakEven });
    if (amounts && input.maxGain) stats.push({ label: "Max gain", value: input.maxGain, tone: "up" });
    if (amounts && input.premium) stats.push({ label: "Premium paid", value: input.premium });
  }
  if (!input.thesis && input.expires) stats.push({ label: "Expires", value: input.expires });
  // the product's name fills the row when little else may be shown
  if (stats.length < 3) stats.push({ label: "Type", value: input.typeLabel });

  const base = {
    eyebrow: input.thesis ? "I believe" : "My trade",
    asset: input.asset,
    title: input.thesis ?? `${input.asset} ${input.typeLabel.toLowerCase()}`,
    titleKind: "sentence" as const,
    titleTone: "plain" as const,
    stats: stats.slice(0, 4),
    tag: input.devnet ? DEVNET_TAG : null,
  };
  const rate = selling && input.aprPct != null ? ` Earning ${input.aprPct.toFixed(2)}% APR on Acta.` : " Traded on Acta.";
  return {
    ...base,
    date: DAY.format(new Date(input.nowMs)),
    alt: altText(base),
    text: `${input.thesis ? `I believe ${input.thesis}.` : `My ${base.title} trade.`}${rate}${input.devnet ? " (devnet)" : ""}`,
    filename: `acta-${input.asset.toLowerCase()}-trade`,
  };
}

export type PnlShareInput = {
  pnl: PnlSummary;
  apr: OpenWrittenApr;
  trading: TradingStats;
  devnet: boolean;
  nowMs: number;
};

/** True when the portfolio has a P&L figure to put on a card: something closed, or something open with a mark. */
export function hasShareablePnl(pnl: PnlSummary): boolean {
  return pnl.settledCount > 0 || pnl.hasUnrealizedMark;
}

/** The portfolio's card: net P&L as the headline, then the same figures the page shows under it. */
export function pnlShareCard({ pnl, apr, trading, devnet, nowMs }: PnlShareInput): ShareCard {
  const net = pnl.realized + (pnl.unrealized ?? 0);
  const tone = (n: number): ShareTone => (n > 0 ? "up" : n < 0 ? "down" : "plain");
  const stats: ShareStat[] = [];
  if (pnl.settledCount > 0) stats.push({ label: "Realised", value: formatSignedUsd(pnl.realized), tone: tone(pnl.realized) });
  if (pnl.unrealized != null) stats.push({ label: "Unrealised", value: formatSignedUsd(pnl.unrealized), tone: tone(pnl.unrealized) });
  if (apr.aprPct != null) stats.push({ label: "APR", value: `${apr.aprPct.toFixed(2)}%` });
  if (trading.sellCount > 0) stats.push({ label: "Premium collected", value: formatUsdSmart(trading.collectedUsd) });

  const base = {
    eyebrow: "Net P&L",
    asset: null,
    title: formatSignedUsd(net),
    titleKind: "figure" as const,
    titleTone: tone(net),
    stats,
    tag: devnet ? DEVNET_TAG : null,
  };
  return {
    ...base,
    date: DAY.format(new Date(nowMs)),
    alt: altText(base),
    text: `My net P&L on Acta: ${formatSignedUsd(net)}${devnet ? " (devnet)" : ""}`,
    filename: "acta-pnl",
  };
}
