import { Metadata } from "next";
import { ReferralsClient } from "@/components/referral/referrals-client";
import { pageMetadata } from "@/lib/site-metadata";

// one wallet's own figures: not a page for a search result
export const metadata: Metadata = pageMetadata({ title: "Referrals", path: "/referrals", index: false });

export const dynamic = "force-dynamic";

export default function ReferralsPage() {
  return <ReferralsClient />;
}
