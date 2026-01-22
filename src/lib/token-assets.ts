import { getTokenLogo } from "./tokens";

/**
 * Get token logo path by symbol
 * @deprecated Use getTokenLogo from @/lib/tokens instead
 */
export function getTokenLogoSrc(symbol: string): string {
  return getTokenLogo(symbol);
}


