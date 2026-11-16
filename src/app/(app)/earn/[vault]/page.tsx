import { Metadata } from "next";
import { VaultDetailClient } from "@/components/vaults/vault-detail-client";
import { pageMetadata } from "@/lib/site-metadata";
import { earnDescription } from "@/lib/vaults/lineup";
import { getRegisteredVaultMeta } from "@/lib/vaults/registry";
import { VAULTS_SAMPLE_MODE, loadSampleData } from "@/lib/vaults/sample";

export const dynamic = "force-dynamic";

// no API fetch: the registry knows the names, and unregistered vaults read "Vault"
export async function generateMetadata({ params }: { params: { vault: string } }): Promise<Metadata> {
  // fixture names live in sample-data.json, which loads on first use
  if (VAULTS_SAMPLE_MODE) await loadSampleData();
  const meta = getRegisteredVaultMeta(params.vault);
  return pageMetadata({
    title: meta?.name ?? "Vault",
    description: meta?.description ?? earnDescription(),
    path: `/earn/${encodeURIComponent(params.vault)}`,
    image: "earn",
  });
}

export default function VaultPage({ params }: { params: { vault: string } }) {
  return <VaultDetailClient pda={params.vault} />;
}
