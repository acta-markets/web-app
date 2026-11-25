import type { QuoteReceivedMessage } from "@acta-markets/ts-sdk/ws";
import { isCashSettledTerms } from "@/lib/spreads";

/**
 * Which quote a taker takes, and until when it can still be filled. One rule for the web app,
 * the headless agent and the devnet runner, so none of them can pick a different winner.
 */

/** What a quote is worth to a seller: the premium after the protocol fee, or the gross price where a product settles in cash. */
export const quotePrice = (quote: QuoteReceivedMessage) =>
  Number(isCashSettledTerms(quote.terms) ? quote.price : quote.net_price ?? quote.price);

/** A buyer pays the gross price, so `net_price` plays no part in ranking a buy; a seller takes the most it keeps. */
export const beatsQuote = (quote: QuoteReceivedMessage, best: QuoteReceivedMessage) =>
  quote.side === "buy" ? Number(quote.price) < Number(best.price) : quotePrice(quote) > quotePrice(best);

/**
 * Whether a quote can still be accepted `marginSeconds` from now. The venue stops taking a quote
 * `settlementBufferSeconds` before its `valid_until` (both come from `Welcome`), so a quote that
 * merely has not expired can already be dead.
 */
export function isFillable(
  quote: Pick<QuoteReceivedMessage, "valid_until">,
  nowSec: number,
  settlementBufferSeconds: number,
  marginSeconds = 0,
): boolean {
  return Number(quote.valid_until) - settlementBufferSeconds > nowSec + marginSeconds;
}

/** The best of the quotes that satisfy `keep`; null when none does. */
export function bestQuote(
  quotes: Iterable<QuoteReceivedMessage>,
  keep: (quote: QuoteReceivedMessage) => boolean = () => true,
): QuoteReceivedMessage | null {
  let best: QuoteReceivedMessage | null = null;
  for (const quote of quotes) {
    if (!keep(quote)) continue;
    if (!best || beatsQuote(quote, best)) best = quote;
  }
  return best;
}
