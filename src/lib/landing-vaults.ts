export type VaultStatus = "live" | "soon" | "launch";

export type LandingVault = {
  id: string;
  asset: string; // display name, e.g. "SOL"
  ticker: string; // e.g. "SOL", "SPYx"
  curator: string; // "Acta" for now
  cycle: "Weekly";
  status: VaultStatus;
  apr?: { staking: number; premium: number }; // ONLY for status "live"
  note?: string;
  ctaLabel: string;
  ctaHref: string;
};

// TODO(tim): confirm access link. Defaults to the Telegram invite already used in the footer.
export const VAULT_ACCESS_URL = "https://t.me/+J3_R6jW-msc1MDU6";
export const CURATOR_CONTACT_URL = "https://t.me/+J3_R6jW-msc1MDU6";

export const LANDING_VAULTS: LandingVault[] = [
  {
    id: "sol",
    asset: "SOL",
    ticker: "SOL",
    curator: "Acta",
    cycle: "Weekly",
    status: "live",
    apr: { staking: 7, premium: 11 },
    note: "Public deposits open after audit.",
    ctaLabel: "Get allocation",
    ctaHref: VAULT_ACCESS_URL,
  },
  // TODO(tim): confirm tokenized stock tickers
  {
    id: "spyx",
    asset: "S&P 500",
    ticker: "SPYx",
    curator: "TBA",
    cycle: "Weekly",
    status: "soon",
    ctaLabel: "Quoting soon",
    ctaHref: "#",
  },
  {
    id: "nvdax",
    asset: "NVIDIA",
    ticker: "NVDAx",
    curator: "TBA",
    cycle: "Weekly",
    status: "soon",
    ctaLabel: "Quoting soon",
    ctaHref: "#",
  },
  {
    id: "tslax",
    asset: "Tesla",
    ticker: "TSLAx",
    curator: "TBA",
    cycle: "Weekly",
    status: "soon",
    ctaLabel: "Quoting soon",
    ctaHref: "#",
  },
  {
    id: "launch",
    asset: "Your asset",
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

/** The one live vault backs the numbers used by the yield-source section. */
export const LIVE_VAULT = LANDING_VAULTS.find((v) => v.status === "live");

export const CAP_NOTE = "Upside caps roughly one week in twelve.";
