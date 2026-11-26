/**
 * Which build of the app this is. The default is Acta's own. A partner edition is the same
 * app with its own assets and vault lineup, built from its own branch: `next.config.mjs` sets
 * `NEXT_PUBLIC_EDITION` from the branch name, and this file is the only place that reads it.
 *
 * `p0`: the P0 partnership. Earn offers one vault, on LST (P0's staked SOL), and LST stands
 * where jitoSOL does in the default build. Devnet only.
 */
export type Edition = "default" | "p0";

export function editionFrom(value: string | undefined): Edition {
  return value?.trim().toLowerCase() === "p0" ? "p0" : "default";
}

export const EDITION: Edition = editionFrom(process.env.NEXT_PUBLIC_EDITION);

/** Assets an edition does not offer, whatever the venue lists. Upper-case symbols. */
const HIDDEN_ASSETS: Record<Edition, ReadonlySet<string>> = {
  default: new Set(),
  p0: new Set(["JITOSOL"]),
};

/** True for an asset this edition leaves out. By symbol, in any case ("jitoSOL", "JITOSOL"). */
export function isHiddenAsset(symbol: string, edition: Edition = EDITION): boolean {
  return HIDDEN_ASSETS[edition].has(symbol.trim().toUpperCase());
}
