import { Metadata } from "next";
import { VaultDetailClient } from "@/components/vaults/vault-detail-client";
import { getRegisteredVaultMeta } from "@/lib/vaults/registry";
import { VAULTS_SAMPLE_MODE, loadSampleData } from "@/lib/vaults/sample";

export const dynamic = "force-dynamic";

// no API fetch: the registry knows the names, and unregistered vaults read "Vault"
export async function generateMetadata({ params }: { params: { vault: string } }): Promise<Metadata> {
  // fixture names live in sample-data.json, which loads on first use
  if (VAULTS_SAMPLE_MODE) await loadSampleData();
  return { title: getRegisteredVaultMeta(params.vault)?.name ?? "Vault" };
}

export default function VaultPage({ params }: { params: { vault: string } }) {
  return <VaultDetailClient pda={params.vault} />;
}
