import { fetchMakerVault } from "@acta-markets/ts-sdk/chain";
import type { TradeRfqFill } from "@acta-markets/ts-sdk/ws";
import { address } from "@solana/kit";
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

/**
 * What `tradeRfq` verifies a served fill against and signs it with. The maker's vault, the
 * keeper and the lookup tables are read from chain, never from the server. `onSigned` runs
 * once the signature exists and before it is submitted.
 */
export async function takerFill(rpc: Rpc, signer: FillSigner, onSigned: () => Promise<void>): Promise<TradeRfqFill> {
  const keeper = await resolveKeeper(rpc).catch(unreadable("the sponsoring keeper"));
  const signTransaction = signer.signTransaction?.bind(signer);
  return {
    keeper,
    taker: address(signer.address),
    bounds: FILL_BOUNDS,
    signer: signTransaction
      ? { address: signer.address, signTransaction: async (wire) => after(await signTransaction(wire), onSigned) }
      : { address: signer.address, signMessage: async (message) => after(await signer.signMessage(message), onSigned) },
    makerVault: (maker) => fetchMakerVault(rpc, maker).catch(unreadable("the quote's maker")),
    lookupTables: (txBase64) => resolveLookupTables(rpc, txBase64),
  };
}

async function after<T>(value: T, run: () => Promise<void>): Promise<T> {
  await run();
  return value;
}

function unreadable(what: string) {
  return (error: unknown): never => {
    throw new Error(`Unable to read ${what}: ${error instanceof Error ? error.message : String(error)}`);
  };
}
