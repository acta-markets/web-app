import { Metadata } from "next";
import { VaultsClient } from "@/components/vaults/vaults-client";

export const metadata: Metadata = {
  title: "Earn"
};

export const dynamic = "force-dynamic";

export default function EarnPage() {
  return <VaultsClient />;
}
