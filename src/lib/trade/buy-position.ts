/** A live bought option in Portfolio: funding closes at expiry, and an unfunded buy forfeits even in the money. */
export type BuyStatus = "deposit" | "will_exercise" | "deposit_returns" | "not_exercised" | "expired" | "settling";

export const BUY_STATUS_LABEL: Record<Exclude<BuyStatus, "deposit">, string> = {
  will_exercise: "Will exercise",
  deposit_returns: "Deposit returns",
  not_exercised: "Not exercised",
  expired: "Expired",
  settling: "Settling",
};

export type BuyFacts = {
  state: "open" | "funded";
  expiryTs: number;
  isPut: boolean;
  strike1e9: number;
  /** the market's finalized price, the only one settlement reads; null until finalized */
  settlementPrice1e9: number | null;
};

/** A tie is out of the money, as on chain. */
export function isInTheMoney(isPut: boolean, price1e9: number, strike1e9: number): boolean {
  return isPut ? price1e9 < strike1e9 : price1e9 > strike1e9;
}

export function buyStatus({ state, expiryTs, isPut, strike1e9, settlementPrice1e9 }: BuyFacts, nowSec: number): BuyStatus {
  const itm = settlementPrice1e9 == null ? null : isInTheMoney(isPut, settlementPrice1e9, strike1e9);
  if (state === "funded") return itm === false ? "deposit_returns" : "will_exercise";
  if (nowSec < expiryTs) return "deposit";
  if (itm == null) return "settling";
  return itm ? "not_exercised" : "expired";
}
