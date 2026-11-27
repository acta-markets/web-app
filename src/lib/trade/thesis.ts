/**
 * Easy mode's thesis: "I believe SOL will be above $150 on Nov 7". The view maps onto the
 * option that pays when it holds. Selling:
 *   above → sell a cash-secured put (deposit USDC), right when the price ends ≥ the strike
 *   below → sell a covered call (deposit the asset), right when the price ends ≤ the strike
 * Right means the deposit comes back; wrong means it converts at the strike. The premium
 * is paid upfront and kept either way. Buying:
 *   above → buy a call, in the money when the price ends > the strike
 *   below → buy a put, in the money when the price ends < the strike
 * The premium is paid upfront and only a deposit made before expiry can exercise.
 * A bought spread caps the payoff at its width, settles in USDC and takes no deposit:
 *   above → call spread from the strike up to a higher leg
 *   below → put spread from the strike down to a lower leg, or a cash put down to zero
 * A call has no such floor, so it is never offered without its upper leg.
 * All Easy copy lives here.
 */
import { formatStrikePrice } from "@/lib/markets";
import { isCashSettled, wireAmount, type ProductTerms, type TakerSide } from "@/lib/spreads";
import { formatAmount, formatAmountFixed, formatExpiryDay, formatPrice, formatUsdc } from "@/lib/trade/format";

export type Direction = "above" | "below";
export type PositionType = "covered_call" | "cash_secured_put";

export type DirectionInfo = {
  value: Direction;
  arrow: string;
  positionType: PositionType;
  isPut: boolean;
  /** order-details name of the option the user trades */
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

const BUY_DIRECTIONS: ReadonlyArray<DirectionInfo> = [
  {
    value: "above",
    arrow: "↗",
    positionType: "covered_call",
    isPut: false,
    optionName: "Buy a call",
    optionExplainer:
      "You pay a premium now for the right to buy the asset at the strike. To use that right, deposit USDC before expiry.",
  },
  {
    value: "below",
    arrow: "↘",
    positionType: "cash_secured_put",
    isPut: true,
    optionName: "Buy a put",
    optionExplainer:
      "You pay a premium now for the right to sell the asset at the strike. To use that right, deposit the asset before expiry.",
  },
];

export function directionsFor(side: TakerSide): ReadonlyArray<DirectionInfo> {
  return side === "buy" ? BUY_DIRECTIONS : DIRECTIONS;
}

export function directionInfo(direction: Direction, side: TakerSide = "sell"): DirectionInfo {
  const [above, below] = directionsFor(side);
  return direction === "above" ? above : below;
}

/**
 * The four Easy strategies: one choice instead of a side plus a direction. A bullish
 * belief (above) is a bought call or a sold put; a bearish one (below) is a bought put
 * or a sold call.
 */
export type Strategy = "buy_call" | "buy_put" | "sell_call" | "sell_put";

export type StrategyInfo = Omit<DirectionInfo, "value" | "arrow"> & {
  strategy: Strategy;
  side: TakerSide;
  direction: Direction;
  arrow: string;
  /** the tile's title, e.g. "Buy a call" */
  label: string;
  /** the tile's one-line descriptor */
  short: string;
};

const STRATEGY_DEFS: Record<Strategy, { side: TakerSide; direction: Direction; label: string; short: string }> = {
  buy_call: {
    side: "buy",
    direction: "above",
    label: "Buy a call",
    short: "Pay a premium to profit from a rise",
  },
  buy_put: {
    side: "buy",
    direction: "below",
    label: "Buy a put",
    short: "Pay a premium to profit from a fall",
  },
  sell_put: {
    side: "sell",
    direction: "above",
    label: "Sell a put",
    short: "Earn a premium on deposited USDC",
  },
  sell_call: {
    side: "sell",
    direction: "below",
    label: "Sell a call",
    short: "Earn a premium on your asset",
  },
};

/** Tile order: the two buys, then the two sells. */
export const STRATEGIES: ReadonlyArray<Strategy> = ["buy_call", "buy_put", "sell_put", "sell_call"];

export function strategyInfo(strategy: Strategy): StrategyInfo {
  const { side, direction, label, short } = STRATEGY_DEFS[strategy];
  const info = directionInfo(direction, side);
  return {
    strategy,
    side,
    direction,
    label,
    short,
    arrow: info.arrow,
    positionType: info.positionType,
    isPut: info.isPut,
    optionName: info.optionName,
    optionExplainer: info.optionExplainer,
  };
}

export function depositSymbol(direction: Direction, asset: string): string {
  return direction === "above" ? "USDC" : asset;
}

/** What the sentence's amount is counted in: the deposit when selling, the asset when buying. */
export function amountSymbol(side: TakerSide, direction: Direction, asset: string): string {
  return side === "buy" ? asset : depositSymbol(direction, asset);
}

/** The sentence's fixed words, in reading order around the pills. */
export const SENTENCE = {
  lead: "I think",
  willBe: "ends",
  on: "by",
  deposit: "If I deposit",
  paid: "I get paid",
  buy: "If I buy",
  pay: "I pay",
  /** a buy has no indicative price: the premium is only known from the quote */
  quotedPremium: "the quoted premium",
  now: "now",
} as const;

/**
 * The sentence's second line, in parts, so two of its words can be controls: the verb switches
 * between buying and selling, and a buy names its strike as a price that can be changed. Read
 * together: "You're buying a $61,000 call option that makes +$28 or more if you're right, risking only
 * ≈$21.73".
 */
export type TradeLine = {
  lead: string;
  verb: string;
  /** a buy only: the words between the verb and the strike ("a") */
  before?: string;
  /** a buy only: the strike, formatted, where the line has its strike control */
  strike?: string;
  rest: string;
};

/**
 * What is being traded, for how much, what it can make and what being wrong costs. The first
 * line of the sentence is the belief itself, so this one is the trade made on it.
 *
 * `strike` is the option's strike, formatted ("$150"); without one the line still names the
 * option, so the switch in it is always there. `premium` is the money that changes hands now,
 * formatted ("≈$1.10"), absent until the trade is priced and sized.
 *
 * Selling, the first line's price is the strike. The premium is earned either way, so the line
 * never makes it depend on the outcome; being wrong means the deposit is exchanged at the
 * strike: "…a put option to earn ≈$1.10, but if you're wrong you buy SOL at $150" (a call:
 * "…you sell your SOL at $170").
 *
 * Buying, the first line's price is the buyer's goal, not the strike, so the strike is named
 * here. `goalProfit` is what the trade makes with the price at that goal ("+$28"); past the
 * goal it makes more, hence "or more". The premium is the price and the whole risk: "…a $61,000
 * call option that makes +$28 or more if you're right, risking only ≈$21.73".
 */
export function tradeLine({
  asset,
  direction,
  side,
  strike,
  premium = null,
  goalProfit = null,
}: {
  asset: string;
  direction: Direction;
  side: TakerSide;
  strike: string | null;
  premium?: string | null;
  goalProfit?: string | null;
}): TradeLine {
  const lead = "You're";
  const verb = side === "buy" ? "buying" : "selling";
  const isPut = directionInfo(direction, side).isPut;
  const kind = `${isPut ? "put" : "call"} option`;
  if (side === "buy") {
    // What it makes if right, then what is at risk. The price is said once, as the risk, and
    // with a strike the option goes by its short name ("a $61,000 call"): the line has to fit
    // beside two controls.
    const risk = premium ? `risking only ${premium}` : "risking only what you pay for it";
    const makes = premium && goalProfit ? ` that makes ${goalProfit} or more if you're right, ` : ", ";
    if (!strike) return { lead, verb, rest: `a ${kind}${makes}${risk}` };
    return { lead, verb, before: "a", strike, rest: `${isPut ? "put" : "call"} option${makes}${risk}` };
  }
  if (!strike) return { lead, verb, rest: `a ${kind}` };
  // a sold put's deposit buys the asset at the strike; a sold call's asset is sold there
  const wrong = isPut ? `you buy ${asset} at ${strike}` : `you sell your ${asset} at ${strike}`;
  return { lead, verb, rest: `a ${kind}${premium ? ` to earn ${premium}` : ""}, but if you're wrong ${wrong}` };
}

/** The same line as one string. */
export function tradeLineText(input: Parameters<typeof tradeLine>[0]): string {
  const line = tradeLine(input);
  return [line.lead, line.verb, line.before, line.strike, line.rest].filter(Boolean).join(" ");
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

/** The move's magnitude as a one-decimal string, e.g. "5.0". The one number both the strike readout and the cushion sentence speak. */
function moveMagnitude(distancePct: number): string {
  return Math.abs(distancePct).toFixed(1);
}

/**
 * The move the underlying must make from spot to reach the strike, signed: "+5.0%" rises,
 * "-5.0%" falls. The single source behind both the strike selector's readout (profit mode)
 * and the cushion sentence, so the two never drift apart. `null` without a spot price.
 */
export function movePctText(strike: number, spot: number | null): string | null {
  const d = strikeDistancePct(strike, spot);
  return d == null ? null : `${d > 0 ? "+" : d < 0 ? "-" : ""}${moveMagnitude(d)}%`;
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
export type ZoneLabel = { title: string; premium: string | null; kept?: boolean };

/** Short outcome labels for the chart's right and wrong zones; generic until an amount is set. */
export function zoneLabels({
  asset,
  direction,
  strike,
  scenario: s,
  assetDecimals = 4,
  fixedDecimals = false,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  scenario: Scenario | null;
  assetDecimals?: number;
  /** always show `assetDecimals` digits, so the ticker after the amount does not move as the amount changes */
  fixedDecimals?: boolean;
}): { right: ZoneLabel; wrong: ZoneLabel } {
  const price = formatStrikePrice(strike);
  const amount = (value: number) => (fixedDecimals ? formatAmountFixed(value, assetDecimals) : formatAmount(value, assetDecimals));
  if (!s) {
    return direction === "above"
      ? { right: { title: "Keep your USDC", premium: null }, wrong: { title: `Buy ${asset} at ${price}`, premium: null } }
      : { right: { title: `Keep your ${asset}`, premium: null }, wrong: { title: `Sell ${asset} at ${price}`, premium: null } };
  }
  const premium = formatUsdc(s.premium);
  if (direction === "above") {
    return {
      right: { title: `Keep ${formatUsdc(s.deposit)}`, premium },
      wrong: { title: `Buy ${amount(s.converted)} ${asset} at ${price}`, premium },
    };
  }
  return {
    right: { title: `Keep ${amount(s.deposit)} ${asset}`, premium },
    wrong: { title: `Sold for ${formatUsdc(s.converted)}`, premium },
  };
}

/** A bought option is funded, never "deposited": see "One word per action" in STYLE.md. */
export const BUY_FUND_REMINDER = "To exercise, fund it in Portfolio before expiry.";

export function buyBreakEven(isPut: boolean, strike: number, grossPerUnit: number): number {
  return isPut ? strike - grossPerUnit : strike + grossPerUnit;
}

/** What funding the exercise takes: USDC for a call, the asset for a put. */
export function exerciseDepositText(isPut: boolean, quantity: number, strike: number, asset: string, assetDecimals = 4): string {
  return isPut ? `${formatAmount(quantity, assetDecimals)} ${asset}` : formatUsdc(quantity * strike);
}

/** Outcome cards for a bought option; the amount lost is the quote's, so the copy names no figure. */
export function buyOutcomeCopy({
  asset,
  direction,
  strike,
  sizeText,
}: {
  asset: string;
  direction: Direction;
  strike: number;
  /** e.g. "1.5 SOL" */
  sizeText: string;
}): { right: OutcomeCopy; wrong: OutcomeCopy } {
  const price = formatStrikePrice(strike);
  const above = direction === "above";
  return {
    right: {
      when: `If ${asset} ends ${above ? "above" : "below"} ${price}`,
      result: `If you funded it before expiry, you ${above ? "buy" : "sell"} ${sizeText} at ${price}.`,
      note: "Unfunded, it is not exercised and you lose its value.",
    },
    wrong: {
      when: `If ${asset} ends at or ${above ? "below" : "above"} ${price}`,
      result: "The option expires unused. Any deposit comes back.",
      note: "You lose the premium.",
    },
  };
}

export type BuyKind = "option" | "spread";

export const BUY_KIND_OPTIONS: ReadonlyArray<{ value: BuyKind; label: string }> = [
  { value: "option", label: "Option" },
  { value: "spread", label: "Spread" },
];

const SPREAD_LEGS = 3;

/**
 * The other strike a bought spread can run to: the nearest listed strikes past the chosen
 * one, and zero for a put, which makes it a cash put. Calls have no zero: nothing caps them.
 */
export function spreadLegs(strikes1e9: ReadonlyArray<number>, strike1e9: number, isPut: boolean): number[] {
  const past = strikes1e9
    .filter((s) => (isPut ? s < strike1e9 && s > 0 : s > strike1e9))
    .sort((a, b) => (isPut ? b - a : a - b));
  return isPut ? [...past.slice(0, SPREAD_LEGS - 1), 0] : past.slice(0, SPREAD_LEGS);
}

export function buySpreadTerms(isPut: boolean, strike1e9: number, leg1e9: number): ProductTerms {
  if (!isPut) return { type: "call_spread", lower_strike: wireAmount(strike1e9), upper_strike: wireAmount(leg1e9) };
  return leg1e9 === 0
    ? { type: "cash_put", strike: wireAmount(strike1e9) }
    : { type: "put_spread", lower_strike: wireAmount(leg1e9), upper_strike: wireAmount(strike1e9) };
}

export function spreadLegLabel(isPut: boolean, leg1e9: number): string {
  return leg1e9 === 0 ? "To $0 (cash put)" : `${isPut ? "Down to" : "Up to"} ${formatStrikePrice(leg1e9 / 1e9)}`;
}

/** A bought spread's payoff at full width for `quantity`, before the premium. */
export function spreadMaxGain(quantity: number, strike1e9: number, leg1e9: number): number {
  return (quantity * Math.abs(strike1e9 - leg1e9)) / 1e9;
}

export function spreadBreakEven(isPut: boolean, strike: number, grossPerUnit: number): number {
  return isPut ? strike - grossPerUnit : strike + grossPerUnit;
}

/** The (lower, upper) legs of a cash-settled product, 1e9-scaled. */
export function spreadBounds(terms: ProductTerms): { lower: number; upper: number } | null {
  if (!isCashSettled(terms.type)) return null;
  return terms.type === "cash_put"
    ? { lower: 0, upper: Number(terms.strike) }
    : { lower: Number((terms as { lower_strike: string }).lower_strike), upper: Number((terms as { upper_strike: string }).upper_strike) };
}

export const SPREAD_SETTLEMENT_NOTE = "Settles in USDC at expiry. Nothing to fund.";

/** Outcome cards for a bought spread: the payoff is the only thing that can come back. */
export function spreadOutcomeCopy({
  asset,
  direction,
  strike1e9,
  leg1e9,
  maxPayout,
}: {
  asset: string;
  direction: Direction;
  strike1e9: number;
  leg1e9: number;
  maxPayout: string;
}): { right: OutcomeCopy; wrong: OutcomeCopy } {
  const price = formatStrikePrice(strike1e9 / 1e9);
  const above = direction === "above";
  const full = formatStrikePrice(leg1e9 / 1e9);
  return {
    right: {
      when: `If ${asset} ends ${above ? "above" : "below"} ${price}`,
      result: `You receive up to ${maxPayout}, the full amount at ${full} or ${above ? "above" : "below"}.`,
      note: SPREAD_SETTLEMENT_NOTE,
    },
    wrong: {
      when: `If ${asset} ends at or ${above ? "below" : "above"} ${price}`,
      result: "The spread expires worthless.",
      note: "You lose the premium.",
    },
  };
}

export function spreadZoneLabels(maxPayout: string | null): { right: ZoneLabel; wrong: ZoneLabel } {
  return {
    right: { title: maxPayout ? `Up to ${maxPayout}` : "Cash payoff", premium: null, kept: false },
    wrong: { title: "You lose premium", premium: null, kept: false },
  };
}

export function buyZoneLabels({
  asset,
  direction,
  strike,
}: {
  asset: string;
  direction: Direction;
  strike: number;
}): { right: ZoneLabel; wrong: ZoneLabel } {
  const price = formatStrikePrice(strike);
  const winSide = direction === "above" ? "above" : "below";
  const loseSide = direction === "above" ? "below" : "above";
  return {
    right: { title: `${asset} ${winSide} ${price} \u2014 profit`, premium: null, kept: false },
    wrong: { title: `${asset} ${loseSide} ${price} \u2014 you lose premium`, premium: null, kept: false },
  };
}

export type EasyCtaState = {
  walletConnected: boolean;
  referralGated: boolean;
  pricesLoading: boolean;
  /** prices are on screen from the last visit while this session's own are on their way */
  pricesLastKnown?: boolean;
  hasMarkets: boolean;
  hasStrike: boolean;
  priced: boolean;
  amountEntered: boolean;
  sizeViolation: string | null;
  insufficientBalance: boolean;
  connecting: boolean;
  requesting: boolean;
  /** the actionable button's label, e.g. "Buy a call"; defaults to "Get quote" */
  ctaLabel?: string;
};

export type EasyCta = { label: string; action: "connect" | "redeem" | "quote" | null };

/** The button's label and what a click does; null action means disabled. */
export function easyCta(s: EasyCtaState): EasyCta {
  if (!s.walletConnected) return { label: "Connect wallet to trade", action: "connect" };
  if (s.referralGated) return { label: "Redeem invite to trade", action: "redeem" };
  if (s.pricesLoading) return { label: s.pricesLastKnown ? "Updating prices..." : "Loading prices...", action: null };
  if (!s.hasMarkets) return { label: "No markets right now", action: null };
  if (!s.hasStrike) return { label: "Choose a strike", action: null };
  if (!s.priced) return { label: "Premium unavailable", action: null };
  if (!s.amountEntered) return { label: "Enter a size", action: null };
  if (s.sizeViolation) return { label: s.sizeViolation, action: null };
  if (s.insufficientBalance) return { label: "Insufficient balance", action: null };
  if (s.connecting) return { label: "Connecting...", action: null };
  if (s.requesting) return { label: "Getting quote...", action: null };
  return { label: s.ctaLabel ?? "Get quote", action: "quote" };
}
