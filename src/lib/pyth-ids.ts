import { getTokenPythId, TOKENS } from "./tokens";

/**
 * Pyth price feed IDs mapped from tokens config
 * @deprecated Use getTokenPythId from @/lib/tokens instead
 */
export const PYTH_PRICE_IDS = Object.fromEntries(
  Object.entries(TOKENS).flatMap(([key, token]) => [
    [key, token.pythId],
    [token.symbol, token.pythId],
  ])
) as Record<string, string>;

export type PythSymbol = keyof typeof TOKENS;

/**
 * Get Pyth price feed ID for a symbol
 * @deprecated Use getTokenPythId from @/lib/tokens instead
 */
export function getPythId(symbol: string): string | null {
  return getTokenPythId(symbol) ?? null;
}


