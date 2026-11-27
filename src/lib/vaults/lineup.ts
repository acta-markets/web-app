import { EDITION, type Edition } from "@/lib/edition";
import { LANDING_VAULTS, VAULT_ACCESS_URL } from "@/lib/landing-vaults";
import type { ResolvedVaultMeta } from "./registry";
import type { Vault } from "./types";

/**
 * The vaults Earn offers: a short, curated lineup named by what goes in, the way the landing
 * page names them. A vault can sell, buy and write, so its strategy is not its name; to a
 * depositor each of these is an income vault on one asset.
 *
 * The backend serves every open vault, test ones included. Only a vault named here by its
 * address is listed with its live figures. An entry with no address yet is shown from what is
 * written here: open, with its assumed rate and the landing page's way in, or not open yet.
 */
export type LineupNetwork = "devnet" | "mainnet";

export type LineupEntry = {
  id: string;
  /** The deposit asset, exactly as it is written. This is the cell's title. */
  asset: string;
  /** The small label over the title, in the landing page's words. */
  type: string;
  /**
   * The vault behind this entry on each network; null until one is opened and named here.
   * TODO(tim): the addresses of the jitoSOL, USDC and TSLA income vaults.
   */
  pda: Record<LineupNetwork, string | null>;
  /**
   * How the entry reads while no vault address is set for the network: `open` shows it open,
   * with `assumedApr` and a Deposit button that goes where the landing page's does; `soon`
   * shows it dimmed, with nothing to press.
   */
  state: "open" | "soon";
  /**
   * The rate shown until a vault's own figures replace it: an assumption from backtesting, in
   * its parts, never a live result. The headline is always the sum of the parts.
   */
  assumedApr?: { staking: number; premium: number };
};

/** Where Deposit leads for a vault with no address yet: the landing page's access link. */
export const LINEUP_ACCESS_URL = VAULT_ACCESS_URL;
/** Said under the (i) beside an assumed rate; kept here for the cards that import it from the lineup. */
export { ASSUMED_APR_NOTE } from "@/lib/vaults/presentation";

/** The landing page's own figures for an asset, so the two pages cannot drift apart. */
function landingApr(id: string): { staking: number; premium: number } | undefined {
  return LANDING_VAULTS.find((vault) => vault.id === id)?.apr;
}

/** What every vault in the lineup is, said once under its name. */
export const LINEUP_TAGLINE = "Income vault";

/** In the landing page's order: the major, the stable, then the stock. */
const DEFAULT_LINEUP: readonly LineupEntry[] = [
  // staking plus premium: the landing page's SOL figures, which are an LST's
  { id: "jitosol", asset: "jitoSOL", type: "Majors", pda: { devnet: null, mainnet: null }, state: "open", assumedApr: landingApr("sol") },
  { id: "usdc", asset: "USDC", type: "Stables", pda: { devnet: null, mainnet: null }, state: "open", assumedApr: landingApr("usdc") },
  // Tim, 2026-11-15: around 25% from backtesting. The landing page still shows ~70% for xTSLA.
  { id: "tsla", asset: "TSLA", type: "Stocks", pda: { devnet: null, mainnet: null }, state: "open", assumedApr: { staking: 0, premium: 25 } },
];

/**
 * The P0 edition: one vault, on LST. Its rate until the vault's own figures replace it is the
 * landing page's SOL one, staking plus premium, as for any staked SOL.
 */
const P0_LINEUP: readonly LineupEntry[] = [
  { id: "lst", asset: "LST", type: "Majors", pda: { devnet: "CSzSZKBvA41sv1Ek2bHLZNaPgvmLnXEGyXos3tLeDZWT", mainnet: null }, state: "open", assumedApr: landingApr("sol") },
];

/** The vaults an edition's Earn page offers. */
export function lineupFor(edition: Edition): readonly LineupEntry[] {
  return edition === "p0" ? P0_LINEUP : DEFAULT_LINEUP;
}

/** This build's lineup. */
export const VAULT_LINEUP: readonly LineupEntry[] = lineupFor(EDITION);

/** The lineup's assets as running text, "jitoSOL, USDC and TSLA": for a page description or a preview image. */
export function lineupAssetsText(lineup: readonly LineupEntry[] = VAULT_LINEUP, last = " and "): string {
  const assets = lineup.map((entry) => entry.asset);
  return assets.length < 2 ? assets.join("") : `${assets.slice(0, -1).join(", ")}${last}${assets[assets.length - 1]}`;
}

/** What Earn offers, mid-sentence: "income vaults on jitoSOL, USDC and TSLA", or "an income vault on LST" for a lineup of one. */
export function lineupVaultsText(lineup: readonly LineupEntry[] = VAULT_LINEUP): string {
  return `${lineup.length === 1 ? "an income vault" : "income vaults"} on ${lineupAssetsText(lineup)}`;
}

/** Earn in one line, for the page's description and its link preview. No rate: the lineup's rates are assumptions. */
export function earnDescription(lineup: readonly LineupEntry[] = VAULT_LINEUP): string {
  const vaults = lineupVaultsText(lineup);
  return `${vaults.charAt(0).toUpperCase()}${vaults.slice(1)}. Deposit what you already hold and earn premium from trading desks. No liquidations.`;
}

export type LineupSlot<T> = { entry: LineupEntry; bound: T | null };

/**
 * Pairs each lineup entry with the served vault it names, in lineup order. A vault is bound
 * by address and by nothing else, so a test vault on the same asset can never stand in for
 * the real one. `byAsset` is for fixture data only, whose addresses are made up: there the
 * first vault that takes the entry's asset is used.
 */
export function resolveLineup<T extends { vault: Pick<Vault, "vault_pda">; meta: Pick<ResolvedVaultMeta, "assetSymbol"> }>(
  served: readonly T[],
  { network, byAsset = false, lineup = VAULT_LINEUP }: { network: LineupNetwork; byAsset?: boolean; lineup?: readonly LineupEntry[] },
): LineupSlot<T>[] {
  return lineup.map((entry) => {
    const pda = entry.pda[network];
    const bound =
      (pda ? served.find((item) => item.vault.vault_pda === pda) : undefined) ??
      (byAsset ? served.find((item) => item.meta.assetSymbol === entry.asset) : undefined) ??
      null;
    return { entry, bound };
  });
}

/** The lineup entry a vault is listed under, by its address; undefined for any other vault. */
export function lineupEntryFor(pda: string, network: LineupNetwork, lineup: readonly LineupEntry[] = VAULT_LINEUP): LineupEntry | undefined {
  return lineup.find((entry) => entry.pda[network] === pda);
}

/**
 * A listed vault goes by its lineup name everywhere it is shown: the asset as its name,
 * "Income vault" under it and the asset's logo alone, in place of whatever its operator called
 * it. It also carries the lineup's rate: the staking part counts toward the headline from the
 * start, because the share price leaves it out, and the whole assumed rate stands in until the
 * vault has a figure of its own (`vaultApr`).
 */
export function withLineupName(meta: ResolvedVaultMeta, entry: LineupEntry | undefined): ResolvedVaultMeta {
  if (!entry) return meta;
  return {
    ...meta,
    name: entry.asset,
    tagline: LINEUP_TAGLINE,
    legs: [entry.asset],
    assumedApr: entry.assumedApr,
    stakingAprPct: entry.assumedApr?.staking ?? meta.stakingAprPct,
  };
}
