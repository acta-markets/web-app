"use client";

import type { SpreadTerms } from "@acta-markets/ts-sdk/chain";
import { spreadPreview } from "@/lib/spreads";

export type SpreadFees = { premiumBps: number; volumeBps: number };

/** What a quoted spread pays and risks. Renders nothing until there is a quote and the fees. */
export function SpreadPreview({ terms, price, fees, quoteSymbol = "USDC" }: { terms: SpreadTerms; price?: number; fees: SpreadFees | null; quoteSymbol?: string }) {
  if (price == null || !fees) return null;
  let preview: ReturnType<typeof spreadPreview>;
  try {
    preview = spreadPreview(terms, BigInt(price), fees.premiumBps, fees.volumeBps);
  } catch {
    return <p role="alert" className="font-mono text-sm text-error">Quote premium is invalid for this spread.</p>;
  }
  const cash = (atoms: bigint) => `${(Number(atoms) / 10 ** terms.quoteDecimals).toLocaleString("en-US", { maximumFractionDigits: terms.quoteDecimals })} ${quoteSymbol}`;
  const rows: Array<[string, string]> = [
    ["You receive", cash(preview.netPremium)],
    ["Max loss", cash(preview.maxLoss)],
    ["Breakeven", `${preview.breakeven.toLocaleString("en-US", { maximumFractionDigits: 6 })} ${quoteSymbol}`],
  ];
  return (
    <dl className="flex flex-col gap-2 font-mono text-sm leading-[1.2] tracking-[-0.28px]">
      {rows.map(([label, value], i) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-content-secondary">{label}</dt>
          <dd className={i === 0 ? "text-base font-medium tabular-nums text-content-primary" : "tabular-nums text-content-primary"}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
