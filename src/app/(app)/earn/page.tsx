import { Metadata } from "next";
import { VaultsClient } from "@/components/vaults/vaults-client";
import { parseCategoryParam } from "@/lib/vaults/registry";

export const metadata: Metadata = {
  title: "Earn"
};

export const dynamic = "force-dynamic";

export default function EarnPage({ searchParams }: { searchParams: { category?: string | string[] } }) {
  return <VaultsClient initialCategory={parseCategoryParam(searchParams.category)} />;
}
