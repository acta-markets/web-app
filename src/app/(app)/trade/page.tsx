import { Metadata } from "next";
import { TradeClient } from "@/components/trade/trade-client";
import { pageMetadata, tradeTitle } from "@/lib/site-metadata";

const TRADE_DESCRIPTION =
  "Say where a price will be on a date. Get paid a premium for it now, or pay one and profit if you are right.";

// A link that preselects an asset names it in the title; the page's own address stays /trade.
export function generateMetadata({ searchParams }: { searchParams: { asset?: string | string[] } }): Metadata {
  return pageMetadata({ title: tradeTitle(searchParams.asset), description: TRADE_DESCRIPTION, path: "/trade", image: "trade" });
}

export const dynamic = "force-dynamic";

export default function TradePage() {
  return <TradeClient />;
}
