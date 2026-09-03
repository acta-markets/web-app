export type VaultStatus = "live" | "soon" | "launch";

export type LandingVault = {
  id: string;
  asset: string; // display name, e.g. "SOL"
  ticker: string; // e.g. "SOL", "USDC"
  curator: string; // "Acta" for now
  cycle: "Weekly";
  status: VaultStatus;
  apr?: { staking: number; premium: number }; // ONLY for status "live"
  riskNote?: string; // the one-liner describing what the vault gives up
  note?: string;
  ctaLabel: string;
  ctaHref: string;
};

// TODO(tim): confirm access link. Defaults to the Telegram invite already used in the footer.
export const VAULT_ACCESS_URL = "https://t.me/+J3_R6jW-msc1MDU6";
export const CURATOR_CONTACT_URL = "https://t.me/+J3_R6jW-msc1MDU6";

export const CAP_NOTE = "Upside caps roughly one week in twelve.";

export const LANDING_VAULTS: LandingVault[] = [
  {
    id: "sol",
    asset: "SOL",
    ticker: "SOL",
    curator: "Acta",
    cycle: "Weekly",
    status: "live",
    apr: { staking: 7, premium: 11 },
    riskNote: CAP_NOTE,
    note: "Public deposits open after audit.",
    ctaLabel: "Get allocation",
    ctaHref: VAULT_ACCESS_URL,
  },
  {
    id: "usdc",
    asset: "USDC",
    ticker: "USDC",
    // TODO(tim): confirm curator and CTA for the USDC vault, copied from SOL for now
    curator: "Acta",
    cycle: "Weekly",
    status: "live",
    // no staking leg: the whole rate is desk premium
    apr: { staking: 0, premium: 20 },
    // TODO(tim): needs its own risk one-liner. The upside-cap sentence describes
    // the SOL vault and does not apply here, so nothing is shown rather than
    // shipping a sentence that is wrong.
    ctaLabel: "Get allocation",
    ctaHref: VAULT_ACCESS_URL,
  },
  {
    // TODO(tim): confirm the third asset
    id: "tbd",
    asset: "TBD",
    ticker: "TBD",
    curator: "TBA",
    cycle: "Weekly",
    status: "soon",
    ctaLabel: "Quoting soon",
    ctaHref: "#",
  },
  {
    id: "launch",
    asset: "Your vaults",
    ticker: "",
    curator: "You",
    cycle: "Weekly",
    status: "launch",
    ctaLabel: "Launch a vault",
    ctaHref: "/#curators",
  },
];

/** The headline rate is always the sum of its parts, never a hardcoded number. */
export function totalApr(vault: LandingVault): number | null {
  if (!vault.apr) return null;
  return vault.apr.staking + vault.apr.premium;
}

/** Names the legs that actually contribute, so a single-source vault reads right. */
export function aprLegs(vault: LandingVault): string {
  if (!vault.apr) return "";
  const legs: string[] = [];
  if (vault.apr.staking > 0) legs.push("staking");
  if (vault.apr.premium > 0) legs.push("premium");
  return legs.join(" + ");
}

/** The SOL vault backs the numbers used by the yield-source section. */
export const SOL_VAULT = LANDING_VAULTS.find((v) => v.id === "sol");
