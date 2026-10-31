import { SpreadType, spreadCollateral, spreadPayoff, spreadPremium, validateSpreadStrikes, type SpreadTerms } from "@acta-markets/ts-sdk/chain";

export type SpreadProduct = "call_spread" | "put_spread";
export type Product = "covered_call" | "cash_secured_put" | "cash_put" | SpreadProduct;
export const isSpread = (type: string): type is SpreadProduct => type === "call_spread" || type === "put_spread";
export const productLabel = (type: Product) => ({ cash_put: "Cash Put", covered_call: "Covered Call", cash_secured_put: "Cash-Secured Put", call_spread: "Sell Call Spread", put_spread: "Sell Put Spread" })[type];

export type ProductTerms = import("@acta-markets/ts-sdk/ws").OptionTerms;
export const isSpreadTerms = (terms: ProductTerms): terms is Extract<ProductTerms, { type: SpreadProduct }> => isSpread(terms.type);
export const isCashSettled = (type: string) => isSpread(type) || type === "cash_put";
export const isCashSettledTerms = (terms: ProductTerms): terms is Extract<ProductTerms, { type: SpreadProduct | "cash_put" }> => isCashSettled(terms.type);
export { executionTerms } from "@acta-markets/ts-sdk/ws";
export const lowerStrike = (terms: ProductTerms) => isSpreadTerms(terms) ? terms.lower_strike : terms.strike;

/** A 1e9-scaled strike as a plain number: 180_000_000_000 → "180". */
export const strikeText = (strike: number) => (strike / 1e9).toLocaleString("en-US", { maximumFractionDigits: 9 });

/** "SOL 180/200 call": the name a spread goes by in the UI. The symbol is left out when unknown. */
export function spreadName(symbol: string | null, type: SpreadProduct, lower: number, upper: number): string {
  return `${symbol ? `${symbol} ` : ""}${strikeText(lower)}/${strikeText(upper)} ${type === "call_spread" ? "call" : "put"}`;
}

export function quoteMatchesProduct(quote: { terms: ProductTerms; side: string }, request: ProductTerms): boolean {
  if (quote.side !== "sell" || !quote.terms || quote.terms.type !== request.type) return false;
  if (!Number.isSafeInteger(lowerStrike(quote.terms)) || lowerStrike(quote.terms) !== lowerStrike(request)) return false;
  if (isSpreadTerms(request)) {
    return isSpreadTerms(quote.terms) && !("strike" in quote.terms) && Number.isSafeInteger(quote.terms.upper_strike)
      && quote.terms.upper_strike === request.upper_strike;
  }
  return !isSpreadTerms(quote.terms) && !("lower_strike" in quote.terms) && !("upper_strike" in quote.terms);
}

export function exactAtoms(input: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) throw new Error("Invalid token decimals");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(input.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) throw new Error(`Use at most ${decimals} decimal places`);
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] ?? "").padEnd(decimals, "0") || "0");
}

// The SDK's JSON integer API rejects values outside its exact number range.
export function wireInteger(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount exceeds the exact wire integer range");
  return Number(value);
}

/** Server strike ticks by underlying mint; the contract itself has no spread tick or width cap. */
export function strikeTicksByMint(tokens: readonly { mint: string; role: import("@acta-markets/ts-sdk/ws").TokenInfo["role"] }[]): ReadonlyMap<string, bigint> {
  const ticks = new Map<string, bigint>();
  for (const token of tokens) {
    if (token.role.type !== "underlying") continue;
    const tick = BigInt(token.role.strike_tick);
    if (tick > 0n) ticks.set(token.mint, tick);
  }
  return ticks;
}

export function requireStrikeTick(ticks: ReadonlyMap<string, bigint>, underlyingMint: string): bigint {
  const tick = ticks.get(underlyingMint);
  if (tick === undefined) throw new Error("Strike tick for this asset is not available yet");
  return tick;
}

export function spreadTerms(product: SpreadProduct, lower: number, upper: number, quantity: bigint, underlyingDecimals: number, quoteDecimals: number, strikeTick: bigint): SpreadTerms {
  if (![lower, upper].every(Number.isSafeInteger)) throw new Error("Invalid strike precision");
  validateSpreadStrikes(product === "call_spread" ? SpreadType.CallSpread : SpreadType.PutSpread, BigInt(lower), BigInt(upper));
  if (strikeTick <= 0n || BigInt(lower) % strikeTick !== 0n || BigInt(upper) % strikeTick !== 0n) throw new Error("Both strikes must be on the asset's strike tick");
  if (quantity <= 0n) throw new Error("Enter a positive quantity");
  wireInteger(quantity);
  return { positionType: product === "call_spread" ? SpreadType.CallSpread : SpreadType.PutSpread, lowerStrike: BigInt(lower), upperStrike: BigInt(upper), quantity, underlyingDecimals, quoteDecimals };
}

export function spreadPreview(terms: SpreadTerms, price: bigint, premiumBps: number, volumeBps: number) {
  const premium = spreadPremium(terms, price, premiumBps, volumeBps);
  const netPerUnit = Number(premium.netPremium) / 10 ** terms.quoteDecimals / (Number(terms.quantity) / 10 ** terms.underlyingDecimals);
  return { ...premium, maxLoss: premium.collateral - premium.netPremium,
    breakeven: terms.positionType === SpreadType.CallSpread ? Number(terms.lowerStrike) / 1e9 + netPerUnit : Number(terms.upperStrike) / 1e9 - netPerUnit };
}

export function spreadPnl(terms: SpreadTerms, netPremium: bigint, settlementPrice: bigint): bigint {
  return netPremium - spreadPayoff(terms, settlementPrice);
}

export function spreadCollateralCheck(terms: SpreadTerms, balance: bigint | null): { required: bigint; sufficient: boolean } {
  const required = spreadCollateral(terms);
  return { required, sufficient: balance !== null && balance >= required };
}

export function validSpreadPremium(terms: SpreadTerms, price: number): boolean {
  if (!Number.isSafeInteger(price)) return false;
  try {
    spreadPremium(terms, BigInt(price), 0, 0);
    return true;
  } catch { return false; }
}
