import { redirect } from "next/navigation";

// The market page retired into /trade: its sell-only flow is one of the four
// strategies there now, and /trade preselects the asset from ?asset=.
export default function MarketPage({ params }: { params: { asset: string } }) {
  redirect(`/trade?asset=${encodeURIComponent(params.asset)}`);
}
