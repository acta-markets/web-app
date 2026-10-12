import { Metadata } from "next";
import { TradeClient } from "@/components/trade/trade-client";

export const metadata: Metadata = {
  title: "Trade"
};

export const dynamic = "force-dynamic";

export default function TradePage() {
  return <TradeClient />;
}
