import type { TokenInfo, TokenMarketsInfoData } from "@acta-markets/ts-sdk/ws";
import { buildStrikeOptions, indicativesFor, spotFromSnapshot, tradableExpiries } from "@/lib/trade/strikes";
import { AgentError, plainSymbol, serverCode, toAgentError } from "./errors";
import type { ActaSession } from "./session";

const PRICE_SCALE = 1_000_000_000;

export type Side = "sell" | "buy";
export type View = "above" | "below";
export type AgentProduct = "covered_call" | "cash_secured_put";

/**
 * The option a view turns into. The same mapping as the Trade page's sentence
 * (`src/lib/trade/thesis.ts`, held to it by a test): selling `above` is a cash-secured put and
 * `below` a covered call; buying `above` is a call and `below` a put.
 */
export type Strategy = { side: Side; view: View; product: AgentProduct; isPut: boolean; name: string };

export function strategyFor(side: Side, view: View): Strategy {
  const isPut = side === "sell" ? view === "above" : view === "below";
  const product: AgentProduct = isPut ? "cash_secured_put" : "covered_call";
  return { side, view, product, isPut, name: optionName(product, side) };
}

/** A position's option in the words a trade was placed in; a product this build does not trade keeps its own name. */
export function optionName(product: string, side: Side): string {
  if (product !== "covered_call" && product !== "cash_secured_put") return `${side} ${product.replace(/_/g, " ")}`;
  const isPut = product === "cash_secured_put";
  return side === "sell" ? (isPut ? "Sell a put (cash-secured)" : "Sell a call (covered)") : isPut ? "Buy a put" : "Buy a call";
}

export const STRATEGIES: ReadonlyArray<Strategy> = [
  strategyFor("sell", "above"),
  strategyFor("sell", "below"),
  strategyFor("buy", "above"),
  strategyFor("buy", "below"),
];

export type Asset = { symbol: string; mint: string; decimals: number; token: TokenInfo };

/** A listed underlying by its symbol, whatever its case. */
export async function findAsset(session: ActaSession, symbol: string): Promise<Asset> {
  const wanted = symbol.trim().toUpperCase();
  const underlyings = (await session.tokens()).filter((t) => t.role.type === "underlying" && plainSymbol(t.symbol));
  const token = underlyings.find((t) => t.symbol.toUpperCase() === wanted);
  if (!token) {
    throw new AgentError("unknown_asset", `No asset named ${plainSymbol(symbol) ?? "that"} is listed.`, "fix_request", {
      assets: underlyings.map((t) => t.symbol).sort(),
    });
  }
  return { symbol: token.symbol, mint: token.mint, decimals: token.decimals, token };
}

/** One asset's expiries, strikes and indicative premiums, straight from the venue. */
export async function marketSnapshot(session: ActaSession, asset: Asset): Promise<TokenMarketsInfoData> {
  try {
    return await session.tokenMarkets(asset.mint);
  } catch (error) {
    const code = serverCode(error);
    if (code === "market_not_found" || code === "unknown_mint") {
      throw new AgentError("no_markets", `${asset.symbol} has no markets open right now.`, "stop");
    }
    throw toAgentError(error);
  }
}

export const isoDay = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);
export const isoTime = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().replace(".000Z", "Z");
const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** Assets on offer with the yield range selling each side has shown lately. */
export async function listAssets(session: ActaSession) {
  const summary = await session.earnSummary().catch((error) => {
    throw toAgentError(error);
  });
  type Row = { asset: string; quote_token: string | null; nearest_expiry: string; sell_above_apr_pct: [number, number] | null; sell_below_apr_pct: [number, number] | null };
  const assets = new Map<string, Row>();
  for (const row of summary.assets) {
    const symbol = plainSymbol(row.underlying_symbol);
    if (!symbol || (row.position_type !== "covered_call" && row.position_type !== "cash_secured_put")) continue;
    const entry = assets.get(symbol) ?? {
      asset: symbol,
      quote_token: plainSymbol(row.quote_symbol),
      nearest_expiry: isoTime(Number(row.nearest_expiry_ts)),
      sell_above_apr_pct: null,
      sell_below_apr_pct: null,
    };
    const range: [number, number] | null = row.apr.type === "available" ? [round(row.apr.min * 100, 1), round(row.apr.max * 100, 1)] : null;
    if (row.position_type === "cash_secured_put") entry.sell_above_apr_pct = range;
    else entry.sell_below_apr_pct = range;
    assets.set(symbol, entry);
  }
  return {
    network: session.config.network,
    note: "sell_*_apr_pct is [lowest, highest] across the listed strikes and dates: indicative, annualised, and highest where the strike is closest to the price or the date is nearest. null means no fresh premium. acta_get_market gives the strikes.",
    assets: [...assets.values()].sort((a, b) => a.asset.localeCompare(b.asset)),
  };
}

/** One asset's tradable dates and, for one date, every strike with its indicative premium. */
export async function getMarket(
  session: ActaSession,
  input: { asset: string; side?: Side; view?: View; expiry?: string },
) {
  const asset = await findAsset(session, input.asset);
  const data = await marketSnapshot(session, asset);
  const now = session.nowSec();
  const spot = spotFromSnapshot(data);
  const scale = 10 ** data.underlying_decimals;
  const quoteSymbol = plainSymbol(data.quote_symbol) ?? "quote token";

  const strategies = STRATEGIES
    .filter((s) => (!input.side || s.side === input.side) && (!input.view || s.view === input.view))
    .map((strategy) => {
      const expiries = tradableExpiries(data, strategy.isPut, strategy.product, strategy.side, now);
      const shown = input.expiry ? expiries.find((e) => isoDay(e.expiryTs) === input.expiry || String(e.expiryTs) === input.expiry) : expiries[0];
      const strikes = shown
        ? buildStrikeOptions(indicativesFor(data, shown.pda, strategy.product, strategy.side), {
            referencePrice1e9: spot == null ? null : spot * PRICE_SCALE,
            secondsToExpiry: shown.expiryTs - now,
            isPut: strategy.isPut,
          })
        : [];
      return {
        side: strategy.side,
        view: strategy.view,
        option: strategy.name,
        expiries: expiries.map((e) => isoDay(e.expiryTs)),
        expiry_shown: shown ? { date: isoDay(shown.expiryTs), at: isoTime(shown.expiryTs) } : null,
        strikes: strikes.map((s) => ({
          strike: s.strike,
          // a seller's indicative is what is kept after the fee; a buyer's is what is paid
          premium_per_unit: s.bestPrice == null ? null : round(s.bestPrice / PRICE_SCALE, 6),
          // a yield on the deposit: it means something for a seller only
          ...(strategy.side === "sell" ? { apr_pct: s.apr == null ? null : round(s.apr * 100, 2) } : {}),
        })),
      };
    });

  return {
    network: session.config.network,
    asset: asset.symbol,
    quote_token: quoteSymbol,
    reference_price: spot,
    trading_now: data.session.type === "continuous" || data.session.type === "open",
    size: {
      unit: asset.symbol,
      min: Number(data.size_rule.min_size) / scale,
      max: Number(data.size_rule.max_size) / scale,
      step: Number(data.size_rule.step) / scale,
    },
    note: `Premiums are indicative, in ${quoteSymbol} per 1 ${asset.symbol}; a live quote comes from acta_preview_trade. A strike or date not listed here cannot be traded.`,
    strategies,
  };
}
