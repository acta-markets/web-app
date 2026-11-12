/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/cn";
import { getTokenLogoSrc } from "@/lib/token-assets";

/** The token's mark, falling back to a two-letter monogram when no asset exists. */
export function TokenLogo({ symbol, className }: { symbol: string; className?: string }) {
  const logo = getTokenLogoSrc(symbol);
  const base = "h-4 w-4 shrink-0 rounded-full border border-[rgba(240,240,240,0.1)]";
  if (logo) {
    return <img src={logo} alt="" className={cn(base, "bg-content-primary object-cover", className)} />;
  }
  return (
    <span
      className={cn(
        base,
        "flex items-center justify-center bg-action-primary font-mono text-[9px] font-medium leading-none text-content-primary",
        className,
      )}
    >
      {symbol.slice(0, 2)}
    </span>
  );
}
