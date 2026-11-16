import { Metadata } from "next";
import { Trade2Client } from "@/components/trade/trade2/trade2-client";
import { pageMetadata } from "@/lib/site-metadata";

// a working page, not one the site offers: kept out of search results
export const metadata: Metadata = pageMetadata({ title: "Trade 2", path: "/trade2", index: false });

export const dynamic = "force-dynamic";

export default function Trade2Page() {
  return <Trade2Client />;
}
