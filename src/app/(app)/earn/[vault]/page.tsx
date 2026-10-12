import { Metadata } from "next";
import { VaultDetailClient } from "@/components/vaults/vault-detail-client";
import { getRegisteredVaultMeta } from "@/lib/vaults/registry";

export const dynamic = "force-dynamic";

// no server fetch: the registry knows the names, and unregistered vaults read "Vault"
export function generateMetadata({ params }: { params: { vault: string } }): Metadata {
  return { title: getRegisteredVaultMeta(params.vault)?.name ?? "Vault" };
}

export default function VaultPage({ params }: { params: { vault: string } }) {
  return <VaultDetailClient pda={params.vault} />;
}
