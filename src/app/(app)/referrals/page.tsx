import { Metadata } from "next";
import { ReferralsClient } from "@/components/referral/referrals-client";

export const metadata: Metadata = {
  title: "Referrals",
};

export const dynamic = "force-dynamic";

export default function ReferralsPage() {
  return <ReferralsClient />;
}
