import { Metadata } from "next";
import { TradeClient } from "@/components/trade/trade-client";

export const metadata: Metadata = {
  title: "Trade 3 — type scale",
};

export const dynamic = "force-dynamic";

/**
 * The same trade page as /trade, in this branch's design pass: every type size on
 * the handoff scale (12/14/16 and up) and every surface square. Nothing else differs,
 * so /trade in this branch and this route render identically; the route exists so the
 * variant can be opened by name while comparing against another checkout.
 */
export default function Trade3Page() {
  return (
    <div className="relative">
      <span className="pointer-events-none fixed bottom-3 left-3 z-50 border border-bg-border bg-bg-primary px-2 py-1 font-mono text-[12px] text-content-secondary">
        v2 · type scale · square corners
      </span>
      <TradeClient />
    </div>
  );
}
