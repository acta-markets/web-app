export type VaultStatus = "live" | "soon" | "launch";

export type LandingVault = {
  id: string;
  asset: string;
  type: string;
  curator: string;
  cycle: "Weekly";
  status: VaultStatus;
  apr?: { staking: number; premium: number };
  riskNote?: string;
  note?: string;
  ctaLabel: string;
  ctaHref: string;
};

export const VAULT_ACCESS_URL = "https://t.me/+J3_R6jW-msc1MDU6";
export const PARTNER_EMAIL = "connect@acta.markets";

export const CAP_NOTE = "Your upside stops roughly one week in twelve.";

export const LANDING_VAULTS: LandingVault[] = [
  {
    id: "sol",
    asset: "SOL",
    type: "Majors",
    curator: "Acta",
    cycle: "Weekly",
    status: "live",
    apr: { staking: 7, premium: 11 },
    riskNote: CAP_NOTE,
    note: "Public deposits open after audit.",
    ctaLabel: "Deposit",
    ctaHref: VAULT_ACCESS_URL,
  },
  {
    id: "usdc",
    asset: "USDC",
    type: "Stables",
    curator: "Acta",
    cycle: "Weekly",
    status: "live",
    apr: { staking: 0, premium: 20 },
    ctaLabel: "Deposit",
    ctaHref: VAULT_ACCESS_URL,
  },
  {
    id: "xtsla",
    asset: "xTSLA",
    type: "Stocks",
    curator: "TBA",
    cycle: "Weekly",
    status: "soon",
    apr: { staking: 0, premium: 70 },
    ctaLabel: "Quoting soon",
    ctaHref: "#",
  },
  {
    id: "launch",
    asset: "Your vaults",
    type: "Partners",
    curator: "You",
    cycle: "Weekly",
    status: "launch",
    ctaLabel: "Partner with us",
    ctaHref: "/partners",
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
