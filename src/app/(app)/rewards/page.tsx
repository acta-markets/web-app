import { Metadata } from "next";
import { RewardsClient } from "@/components/rewards/rewards-client";
import { pageMetadata } from "@/lib/site-metadata";

// Kept out of search until a first season is live: until then the page has nothing to show.
export const metadata: Metadata = pageMetadata({
  title: "Rewards",
  description: "Trading leagues on Acta: the open leagues, the rules that earn points, and the boards.",
  path: "/rewards",
  index: false,
});

export default function RewardsPage() {
  return <RewardsClient />;
}
