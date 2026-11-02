/**
 * Easy mode's thesis: "I believe SOL will be above $150 on Nov 7". A taker can only
 * sell options, so the view maps onto the option that pays when it holds:
 *   above → sell a cash-secured put (deposit USDC), right when the price ends ≥ the strike
 *   below → sell a covered call (deposit the asset), right when the price ends ≤ the strike
 * Right means the deposit comes back; wrong means it converts at the strike. The premium
 * is paid upfront and kept either way. All Easy copy lives here.
 */
import { formatStrikePrice } from "@/lib/markets";
import { formatAmount, formatExpiryDay, formatPrice, formatUsdc } from "@/lib/trade/format";

export type Direction = "above" | "below";
export type PositionType = "covered_call" | "cash_secured_put";

export type DirectionInfo = {
  value: Direction;
  arrow: string;
  positionType: PositionType;
  isPut: boolean;
  /** order-details name of the option the user sells */
  optionName: string;
  optionExplainer: string;
};

export const DIRECTIONS: ReadonlyArray<DirectionInfo> = [
  {
    value: "above",
    arrow: "↗",
    positionType: "cash_secured_put",
    isPut: true,
    optionName: "Sell a put (cash-secured)",
    optionExplainer:
      "You deposit USDC and sell a put option, so you are paid now. If the price ends below your price, your USDC buys the asset at your price.",
  },
  {
    value: "below",
    arrow: "↘",
    positionType: "covered_call",
    isPut: false,
    optionName: "Sell a call (covered)",
    optionExplainer:
      "You deposit the asset and sell a call option, so you are paid now. If the price ends above your price, your asset is sold at your price.",
  },
];

export function directionInfo(direction: Direction): DirectionInfo {
  return direction === "above" ? DIRECTIONS[0] : DIRECTIONS[1];
}

export function depositSymbol(direction: Direction, asset: string): string {
  return direction === "above" ? "USDC" : asset;
}

/** The sentence's fixed words, in reading order around the pills. */
export const SENTENCE = {
  lead: "I believe",
  willBe: "will be",
  on: "on",
  deposit: "If I deposit",
  paid: "I get paid",
  now: "now",
} as const;

/**
 * Where today's price stands against the thesis. When it already holds, the room before
 * it fails ("SOL can fall 1.5% and you're still right."); when it doesn't, the move it
 * needs ("SOL has to rise 4.8% for you to be right."). Ties count as right, as at
 * settlement. `distancePct` is (strike − spot) / spot; null without a spot price.
 */
export function cushionText(asset: string, direction: Direction, distancePct: number | null): string | null {
  if (distancePct == null) return null;
  const pct = Math.abs(distancePct).toFixed(1);
  if (pct === "0.0") return `${asset} is right at your price today.`;
  const holdsToday = direction === "above" ? distancePct <= 0 : distancePct >= 0;
  if (holdsToday) return `${asset} can ${direction === "above" ? "fall" : "rise"} ${pct}% and you're still right.`;
  return `${asset} has to ${direction === "above" ? "rise" : "fall"} ${pct}% for you to be right.`;
}

/** The payout line's closing words, e.g. "≈$0.95 (126% APR) now."; the sentence renders exactly this text. */
export function payoutTail(earnings: string, apr: string | null): string {
  return apr ? `${earnings} (${apr} APR) ${SENTENCE.now}.` : `${earnings} ${SENTENCE.now}.`;
}

/** One-line form for the order modal, e.g. "SOL will be above $150 on Nov 7". */
export function thesisText({
  asset,
  direction,
  strike,
  expiryMs,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  expiryMs: number;
}): string {
  return `${asset} will be ${direction} ${formatStrikePrice(strike)} on ${formatExpiryDay(expiryMs)}`;
}

/** Strike distance from the reference price, in percent: negative below it. */
export function strikeDistancePct(strike: number, spot: number | null): number | null {
  return spot != null && spot > 0 ? ((strike - spot) / spot) * 100 : null;
}

export type Scenario = {
  /** what is locked, in its own unit: USDC above, the asset below */
  deposit: number;
  /** that deposit in USDC: quantity × strike above, quantity × spot below; null without spot */
  depositUsd: number | null;
  /** indicative premium, USDC */
  premium: number;
  /** premium as a share of the deposit's value, percent */
  returnPct: number | null;
  /** above: below this the user is down vs holding USDC; below: above it holding the asset did better */
  breakEven: number;
  /** wrong outcome: asset bought (above) or USDC received for the asset (below) */
  converted: number;
};

/**
 * Outcome numbers for a thesis. `quantity` is in underlying units (not atomic) and
 * `premiumPerUnit` in USDC per underlying unit.
 */
export function scenario({
  direction,
  quantity,
  strike,
  premiumPerUnit,
  spot,
}: {
  direction: Direction;
  quantity: number;
  strike: number;
  premiumPerUnit: number;
  spot: number | null;
}): Scenario {
  const premium = quantity * premiumPerUnit;
  if (direction === "above") {
    const deposit = quantity * strike;
    return {
      deposit,
      depositUsd: deposit,
      premium,
      returnPct: deposit > 0 ? (premium / deposit) * 100 : null,
      breakEven: strike - premiumPerUnit,
      converted: quantity,
    };
  }
  const depositUsd = spot != null && spot > 0 ? quantity * spot : null;
  return {
    deposit: quantity,
    depositUsd,
    premium,
    returnPct: depositUsd ? (premium / depositUsd) * 100 : null,
    breakEven: strike + premiumPerUnit,
    converted: quantity * strike,
  };
}

/** Is the thesis right at a given settlement price? Ties go to the user, as in settlement. */
export function isRight(direction: Direction, settlementPrice: number, strike: number): boolean {
  return direction === "above" ? settlementPrice >= strike : settlementPrice <= strike;
}

export type OutcomeCopy = { when: string; result: string; note: string };

export function outcomeCopy({
  asset,
  direction,
  strike,
  scenario: s,
  assetDecimals = 4,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  scenario: Scenario;
  assetDecimals?: number;
}): { right: OutcomeCopy; wrong: OutcomeCopy } {
  const price = formatStrikePrice(strike);
  const premium = `the ${formatUsdc(s.premium)} premium`;
  const breakEven = formatPrice(s.breakEven);
  if (direction === "above") {
    const deposit = formatUsdc(s.deposit);
    return {
      right: {
        when: `If ${asset} ends at or above ${price}`,
        result: `You get your ${deposit} back and keep ${premium}.`,
        note: "The premium is your profit.",
      },
      wrong: {
        when: `If ${asset} ends below ${price}`,
        result: `Your ${deposit} buys ${formatAmount(s.converted, assetDecimals)} ${asset} at ${price}. You keep ${premium}.`,
        note: `Below ${breakEven} you are down compared with holding USDC.`,
      },
    };
  }
  const deposit = `${formatAmount(s.deposit, assetDecimals)} ${asset}`;
  return {
    right: {
      when: `If ${asset} ends at or below ${price}`,
      result: `You get your ${deposit} back and keep ${premium}.`,
      note: `You still hold ${asset}, so a falling price still costs you.`,
    },
    wrong: {
      when: `If ${asset} ends above ${price}`,
      result: `Your ${deposit} is sold for ${formatUsdc(s.converted)} at ${price}. You keep ${premium}.`,
      note: `Above ${breakEven} you would have done better holding ${asset}.`,
    },
  };
}

/** `premium` is the kept premium in USDC, null until an amount is set. */
export type ZoneLabel = { title: string; premium: string | null };

/** Short outcome labels for the chart's right and wrong zones; generic until an amount is set. */
export function zoneLabels({
  asset,
  direction,
  strike,
  scenario: s,
  assetDecimals = 4,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  scenario: Scenario | null;
  assetDecimals?: number;
}): { right: ZoneLabel; wrong: ZoneLabel } {
  const price = formatStrikePrice(strike);
  if (!s) {
    return direction === "above"
      ? { right: { title: "Keep your USDC", premium: null }, wrong: { title: `Buy ${asset} at ${price}`, premium: null } }
      : { right: { title: `Keep your ${asset}`, premium: null }, wrong: { title: `Sell ${asset} at ${price}`, premium: null } };
  }
  const premium = formatUsdc(s.premium);
  if (direction === "above") {
    return {
      right: { title: `Keep ${formatUsdc(s.deposit)}`, premium },
      wrong: { title: `Buy ${formatAmount(s.converted, assetDecimals)} ${asset} at ${price}`, premium },
    };
  }
  return {
    right: { title: `Keep ${formatAmount(s.deposit, assetDecimals)} ${asset}`, premium },
    wrong: { title: `Sold for ${formatUsdc(s.converted)}`, premium },
  };
}

export type EasyCtaState = {
  walletConnected: boolean;
  referralGated: boolean;
  pricesLoading: boolean;
  hasMarkets: boolean;
  hasStrike: boolean;
  priced: boolean;
  amountEntered: boolean;
  sizeViolation: string | null;
  insufficientBalance: boolean;
  connecting: boolean;
  requesting: boolean;
};

export type EasyCta = { label: string; action: "connect" | "redeem" | "quote" | null };

/** The button's label and what a click does; null action means disabled. */
export function easyCta(s: EasyCtaState): EasyCta {
  if (!s.walletConnected) return { label: "Connect wallet", action: "connect" };
  if (s.referralGated) return { label: "Redeem invite to trade", action: "redeem" };
  if (s.pricesLoading) return { label: "Loading prices...", action: null };
  if (!s.hasMarkets) return { label: "No markets right now", action: null };
  if (!s.hasStrike) return { label: "Choose a price", action: null };
  if (!s.priced) return { label: "Prices unavailable", action: null };
  if (!s.amountEntered) return { label: "Enter an amount", action: null };
  if (s.sizeViolation) return { label: s.sizeViolation, action: null };
  if (s.insufficientBalance) return { label: "Insufficient balance", action: null };
  if (s.connecting) return { label: "Connecting...", action: null };
  if (s.requesting) return { label: "Getting quote...", action: null };
  return { label: "Get quote", action: "quote" };
}
