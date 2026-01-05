import { Metadata } from "next";
import { MarketClient } from "@/components/market/market-client";

export function generateMetadata({ params }: { params: { asset: string } }): Metadata {
  return {
    title: `${params.asset.toUpperCase()} Market`
  };
}

export default function MarketPage({ params }: { params: { asset: string } }) {
  return <MarketClient asset={params.asset} />;
}



