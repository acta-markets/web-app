/**
 * Expiry conventions for exchange-listed underlyings.
 *
 * TSLA and QQQ are the venue's tokenised stock tokens, so they trade around the clock like
 * every other underlying here. Only their expiry grid is special: QQQ lists its weekly
 * expiries on Fridays at 19:30 UTC and nothing else.
 */

/** QQQ lists expiries only on Fridays, and the venue pins them to 19:30 UTC. */
export function isQqqExpiry(expiryTs: number): boolean {
  const d = new Date(expiryTs * 1000);
  return d.getUTCDay() === 5 && d.getUTCHours() === 19 && d.getUTCMinutes() === 30;
}

/** Symbols whose expiries are restricted to the Friday 19:30 UTC slot. */
export function restrictsToFridayExpiry(symbol: string): boolean {
  return symbol.trim().toUpperCase() === "QQQ";
}
