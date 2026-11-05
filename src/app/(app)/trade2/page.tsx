import { Metadata } from "next";
import { Trade2Client } from "@/components/trade/trade2/trade2-client";

export const metadata: Metadata = {
  title: "Trade 2",
};

export const dynamic = "force-dynamic";

export default function Trade2Page() {
  return <Trade2Client />;
}
