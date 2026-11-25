import type { Vault } from "@acta-markets/ts-sdk";
import { fetchMakerVault } from "@acta-markets/ts-sdk/chain";
import {
  verifyAndSignTakerFill,
  type MarketDescriptorInfo,
  type OptionTerms,
  type QuoteReceivedMessage,
  type TakerFillRfq,
} from "@acta-markets/ts-sdk/ws";
import { address, type Address } from "@solana/kit";
import { isCashSettledTerms } from "@/lib/spreads";
import { resolveKeeper, resolveLookupTables } from "@/lib/sponsored-tx";

/**
 * A taker's fill without a browser: what the keeper-sponsored transaction is checked against
 * and how it is signed. The web app's order hook keeps its own state machine around a wallet
 * popup; the limits and the checks are these.
 */

type Rpc = Parameters<typeof fetchMakerVault>[0];

/** The most compute a served fill may ask for. A transaction outside these is refused, not signed. */
export const FILL_BOUNDS = { maxUnitLimit: 400_000, maxUnitPriceMicroLamports: 100_000 };

/**
 * Signs a fill. `signMessage` returns the raw 64-byte signature over the transaction's message;
 * a signer that can only sign whole transactions gives `signTransaction` instead, and what it
 * returns is verified again by the SDK.
 */
export type FillSigner = {
  address: string;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  signTransaction?(wire: Uint8Array): Promise<Uint8Array>;
};

/** The RFQ a fill is bound to, as the verifier needs it. Cash-settled products also carry the decimals their collateral is computed with. */
export function takerFillRfq({
  rfqId,
  descriptor,
  terms,
  side,
  quantity,
}: {
  rfqId: string;
  descriptor: MarketDescriptorInfo;
  terms: OptionTerms;
  side: TakerFillRfq["side"];
  /** underlying atoms, as decimal text */
  quantity: string;
}): TakerFillRfq {
  const base = { rfq_id: rfqId, side, quantity } as Pick<TakerFillRfq, "rfq_id" | "side" | "quantity">;
  if (isCashSettledTerms(terms)) {
    const quote = descriptor.market_descriptor.quote_mint;
    return {
      ...base,
      market_descriptor: { ...descriptor.market_descriptor, collateral_mint: quote, settlement_mint: quote },
      terms,
      order_options: [terms],
      underlying_decimals: descriptor.underlying_decimals,
      quote_decimals: descriptor.quote_decimals,
    };
  }
  return { ...base, market_descriptor: descriptor.market_descriptor, terms, order_options: [terms] };
}

export type FillParties = { makerVault: Vault | null; keeper: Address };

/**
 * The two accounts a fill is verified against, read from chain and never from the server: the
 * maker's vault (null for an ordinary maker) and the keeper that pays for the transaction.
 * Read them before accepting: once a quote is accepted the signature deadline is running.
 */
export async function readFillParties(rpc: Rpc, quote: Pick<QuoteReceivedMessage, "maker_owner">): Promise<FillParties> {
  const unreadable = (what: string) => (error: unknown): never => {
    throw new Error(`Unable to read ${what}: ${error instanceof Error ? error.message : String(error)}`);
  };
  const [makerVault, keeper] = await Promise.all([
    fetchMakerVault(rpc, quote.maker_owner).catch(unreadable("the quote's maker")),
    resolveKeeper(rpc).catch(unreadable("the sponsoring keeper")),
  ]);
  return { makerVault, keeper };
}

/**
 * Signs the taker's slot of a served fill, only if the transaction opens exactly `quote` on
 * `rfq`, is paid by `keeper` and stays inside `FILL_BOUNDS`. Throws otherwise; nothing is signed.
 */
export async function signTakerFill({
  rpc,
  txBase64,
  quote,
  rfq,
  parties,
  signer,
}: {
  rpc: Rpc;
  txBase64: string;
  quote: QuoteReceivedMessage;
  rfq: TakerFillRfq;
  parties: FillParties;
  signer: FillSigner;
}): Promise<string> {
  const tables = await resolveLookupTables(rpc, txBase64);
  const signTransaction = signer.signTransaction?.bind(signer);
  return verifyAndSignTakerFill({
    txBase64,
    quote,
    rfq,
    keeper: parties.keeper,
    taker: address(signer.address),
    tables,
    bounds: FILL_BOUNDS,
    makerVault: parties.makerVault,
    signer: signTransaction
      ? { address: signer.address, signTransaction }
      : { address: signer.address, signMessage: (message) => signer.signMessage(message) },
  });
}
