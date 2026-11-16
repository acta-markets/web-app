import { Metadata } from "next";
import { VaultsClient } from "@/components/vaults/vaults-client";
import { pageMetadata } from "@/lib/site-metadata";
import { earnDescription } from "@/lib/vaults/lineup";

export const metadata: Metadata = pageMetadata({ title: "Earn", description: earnDescription(), path: "/earn", image: "earn" });

export const dynamic = "force-dynamic";

export default function EarnPage() {
  return <VaultsClient />;
}
