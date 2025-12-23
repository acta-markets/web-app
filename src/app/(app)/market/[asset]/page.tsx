import { MarketClient } from "@/components/market/market-client";

export default function MarketPage({ params }: { params: { asset: string } }) {
  return <MarketClient asset={params.asset} />;
}


