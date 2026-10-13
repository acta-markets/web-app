/* eslint-disable @next/next/no-img-element */

import { cn } from "@/lib/cn";
import { getToken } from "@/lib/tokens";

/**
 * Deposit asset logo. Unknown assets get their initials, case kept as is,
 * instead of the Solana fallback `getTokenLogo` would show.
 */
export function VaultAssetLogo({
  symbol,
  size = 24,
  ring = false,
  label,
  className,
}: {
  symbol: string;
  size?: number;
  /** the separating ring used where a logo overlaps the card band */
  ring?: boolean;
  /** set where the logo is the only thing naming the asset; decorative otherwise */
  label?: string;
  className?: string;
}) {
  const logo = getToken(symbol)?.logo;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(240,240,240,0.1)]",
        logo ? "bg-content-primary" : "bg-action-primary",
        ring && "shadow-[0_0_0_5px_var(--bg-primary)]",
        className,
      )}
      style={{ width: size, height: size }}
      role={label ? "img" : undefined}
      aria-label={label}
      title={label}
    >
      {logo ? (
        <img src={logo} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span
          className="font-mono font-medium leading-none text-content-primary"
          style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}
          aria-hidden="true"
        >
          {symbol.slice(0, 2)}
        </span>
      )}
    </div>
  );
}
