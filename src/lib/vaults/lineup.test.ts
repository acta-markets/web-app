import { describe, expect, it } from "vitest";
import { LINEUP_TAGLINE, VAULT_LINEUP, lineupEntryFor, resolveLineup, withLineupName, type LineupEntry } from "./lineup";
import { LANDING_VAULTS } from "@/lib/landing-vaults";
import type { ResolvedVaultMeta } from "./registry";

const served = (pda: string, assetSymbol: string) => ({ vault: { vault_pda: pda }, meta: { assetSymbol } });
const LINEUP: LineupEntry[] = [
  { id: "a", asset: "jitoSOL", type: "Majors", pda: { devnet: "pda-jito", mainnet: null }, state: "open" },
  { id: "b", asset: "USDC", type: "Stables", pda: { devnet: null, mainnet: "pda-usdc-main" }, state: "soon" },
];

describe("vault lineup", () => {
  it("is jitoSOL, USDC and TSLA, each an income vault, in the landing page's order", () => {
    expect(VAULT_LINEUP.map((entry) => [entry.asset, entry.type])).toEqual([["jitoSOL", "Majors"], ["USDC", "Stables"], ["TSLA", "Stocks"]]);
    expect(LINEUP_TAGLINE).toBe("Income vault");
  });

  it("opens all three on assumed rates: the landing page's for jitoSOL and USDC, about 25% for TSLA", () => {
    expect(VAULT_LINEUP.every((entry) => entry.state === "open")).toBe(true);
    const sol = LANDING_VAULTS.find((vault) => vault.id === "sol")!.apr!;
    const usdc = LANDING_VAULTS.find((vault) => vault.id === "usdc")!.apr!;
    // read from the landing page's own data, so the two pages cannot drift
    expect(VAULT_LINEUP[0].assumedApr).toEqual(sol);
    expect(VAULT_LINEUP[1].assumedApr).toEqual(usdc);
    expect(VAULT_LINEUP[2].assumedApr).toEqual({ staking: 0, premium: 25 });
    // none is tied to a vault yet
    expect(VAULT_LINEUP.every((entry) => entry.pda.devnet === null && entry.pda.mainnet === null)).toBe(true);
  });

  it("binds a vault by its address on the current network and by nothing else", () => {
    const vaults = [served("test-usdc", "USDC"), served("pda-jito", "SOL"), served("pda-usdc-main", "USDC")];
    const devnet = resolveLineup(vaults, { network: "devnet", lineup: LINEUP });
    expect(devnet.map((slot) => slot.bound?.vault.vault_pda ?? null)).toEqual(["pda-jito", null]);
    const mainnet = resolveLineup(vaults, { network: "mainnet", lineup: LINEUP });
    expect(mainnet.map((slot) => slot.bound?.vault.vault_pda ?? null)).toEqual([null, "pda-usdc-main"]);
  });

  it("leaves an entry unbound when its vault is not served, and never lists a vault outside the lineup", () => {
    const slots = resolveLineup([served("someone-elses", "jitoSOL")], { network: "devnet", lineup: LINEUP });
    expect(slots.every((slot) => slot.bound === null)).toBe(true);
    expect(slots).toHaveLength(2);
  });

  it("matches fixtures by asset, since their addresses are made up", () => {
    const slots = resolveLineup([served("fixture-1", "USDC"), served("fixture-2", "jitoSOL")], { network: "devnet", byAsset: true, lineup: [{ ...LINEUP[0], pda: { devnet: null, mainnet: null } }, LINEUP[1]] });
    expect(slots.map((slot) => slot.bound?.vault.vault_pda)).toEqual(["fixture-2", "fixture-1"]);
  });

  it("names a listed vault by its asset and calls it an income vault, and leaves any other vault alone", () => {
    const meta = { name: "SOL seller", tagline: "Sells options only", assetSymbol: "jitoSOL" } as ResolvedVaultMeta;
    expect(withLineupName(meta, lineupEntryFor("pda-jito", "devnet", LINEUP))).toMatchObject({ name: "jitoSOL", tagline: "Income vault" });
    expect(withLineupName(meta, lineupEntryFor("unlisted", "devnet", LINEUP))).toBe(meta);
    expect(lineupEntryFor("pda-jito", "mainnet", LINEUP)).toBeUndefined();
  });
});
