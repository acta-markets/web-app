"use client";

import type { MarketDescriptorInfo, PositionInfo } from "@/lib/rfq-client";
import { executionTerms, isSpreadTerms, spreadName, strikeText } from "@/lib/spreads";
import { NONE, formatDate } from "@/lib/vaults/format";
import { TOKENS, getNetwork } from "@/lib/tokens";
import { AppTable, AppTd, AppTh } from "@/components/app-ui/app-table";
import { spreadCollateral } from "@acta-markets/ts-sdk/chain";

export function spreadPositionAmounts(position: PositionInfo, descriptor?: MarketDescriptorInfo) {
  const terms = executionTerms(position.terms);
  if (!isSpreadTerms(terms) || !Number.isSafeInteger(terms.upper_strike)
    || !Number.isSafeInteger(terms.lower_strike) || !Number.isSafeInteger(position.quantity)
    || terms.upper_strike! <= terms.lower_strike) return null;
  const network = getNetwork();
  const underlying = Object.values(TOKENS).find(token => token.mint[network] === position.underlying_mint);
  const quote = Object.values(TOKENS).find(token => token.mint[network] === position.quote_mint);
  const underlyingDecimals = position.underlying_decimals;
  const quoteDecimals = position.quote_decimals;
  if (underlyingDecimals == null || quoteDecimals == null) return null;
  let collateral: bigint;
  try { collateral = spreadCollateral({ positionType: position.terms.type === "call_spread" ? 2 : 3,
    lowerStrike: BigInt(terms.lower_strike), upperStrike: BigInt(terms.upper_strike!), quantity: BigInt(position.quantity), underlyingDecimals, quoteDecimals }); } catch { return null; }
  const payout = position.state === "settled" && position.settlement.type === "cash" ? BigInt(position.settlement.maker_payoff) : null;
  const returned = position.state === "settled" && position.settlement.type === "cash" ? BigInt(position.settlement.taker_return) : null;
  const premium = Number.isSafeInteger(position.total_premium) ? BigInt(position.total_premium) : null;
  return { collateral, payout, returned, premium, pnl: premium != null && payout != null ? premium - payout : null,
    quantity: Number(position.quantity) / 10 ** underlyingDecimals, quoteDecimals,
    // never a mint address in place of a symbol
    quoteSymbol: descriptor?.quote_symbol ?? quote?.symbol ?? null,
    symbol: descriptor?.underlying_symbol ?? underlying?.symbol ?? null };
}

const STATUS: Record<string, string> = { open: "Open", funded: "Open", liquidated: "Liquidated", settled: "Settled" };

export function SpreadPositions({ positions, descriptors, history }: { positions: PositionInfo[]; descriptors: MarketDescriptorInfo[]; history: boolean }) {
  const rows = positions.flatMap(position => {
    const terms = executionTerms(position.terms);
    return isSpreadTerms(terms) && (history ? position.state === "settled" : position.state !== "settled") ? [{ position, terms }] : [];
  });
  if (!rows.length) return null;
  return <section className="mt-8 flex flex-col gap-4">
    <h3 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary max-md:text-xl">
      {history ? "Settled spreads" : "Spread positions"}: {rows.length}
    </h3>
    <AppTable><thead><tr className="border-b border-bg-border">
      <AppTh>Spread</AppTh>
      <AppTh>Expiry</AppTh>
      <AppTh className="text-right">Size</AppTh>
      <AppTh className="text-right">Premium</AppTh>
      <AppTh className="text-right">Result</AppTh>
    </tr></thead><tbody>{rows.map(({ position, terms }) => {
      const amounts = spreadPositionAmounts(position, descriptors.find(d => d.market.market_pda === position.market));
      const symbol = amounts?.symbol ?? null;
      const cash = (value: bigint | null, signed = false) => value == null || !amounts
        ? NONE
        : `${signed && value > 0n ? "+" : ""}${(Number(value) / 10 ** amounts.quoteDecimals).toLocaleString("en-US", { maximumFractionDigits: amounts.quoteDecimals })}${amounts.quoteSymbol ? ` ${amounts.quoteSymbol}` : ""}`;
      const pnl = amounts?.pnl ?? null;
      const expiry = Number(position.expiry_ts);
      return <tr key={position.pda} className="border-b border-bg-border last:border-b-0">
        <AppTd className="font-medium text-content-primary">
          {terms.upper_strike == null ? NONE : position.terms.type === "cash_put"
            ? `${symbol ? `${symbol} ` : ""}${strikeText(terms.upper_strike)} cash put`
            : spreadName(symbol, terms.type, terms.lower_strike, terms.upper_strike)}
        </AppTd>
        <AppTd className="text-content-secondary">{expiry > 0 ? formatDate(expiry, { year: true }) : NONE}</AppTd>
        <AppTd className="text-right tabular-nums text-content-secondary">
          {amounts ? `${amounts.quantity.toLocaleString("en-US", { maximumFractionDigits: 4 })}${symbol ? ` ${symbol}` : ""}` : NONE}
        </AppTd>
        <AppTd className="text-right tabular-nums text-content-secondary">{cash(amounts?.premium ?? null)}</AppTd>
        <AppTd className={pnl != null && pnl < 0n ? "text-right tabular-nums text-error" : "text-right tabular-nums text-content-primary"}>
          {position.state === "settled" && pnl != null ? cash(pnl, true) : STATUS[position.state] ?? NONE}
        </AppTd>
      </tr>;
    })}</tbody></AppTable>
  </section>;
}
