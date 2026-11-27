import { describe, expect, it } from "vitest";
import { LINEUP_TAGLINE, VAULT_LINEUP, earnDescription, lineupAssetsText, lineupEntryFor, lineupFor, lineupVaultsText, resolveLineup, withLineupName, type LineupEntry } from "./lineup";
import { LANDING_VAULTS } from "@/lib/landing-vaults";
import type { ResolvedVaultMeta } from "./registry";

const served = (pda: string, assetSymbol: string) => ({ vault: { vault_pda: pda }, meta: { assetSymbol } });
const LINEUP: LineupEntry[] = [
  { id: "a", asset: "jitoSOL", type: "Majors", pda: { devnet: "pda-jito", mainnet: null }, state: "open" },
  { id: "b", asset: "USDC", type: "Stables", pda: { devnet: null, mainnet: "pda-usdc-main" }, state: "soon" },
];

describe("the P0 edition's lineup", () => {
  const p0 = lineupFor("p0");

  it("is one vault, on LST, open on the landing page's staked SOL rate", () => {
    expect(p0.map((entry) => [entry.id, entry.asset, entry.type, entry.state])).toEqual([["lst", "LST", "Majors", "open"]]);
    expect(p0[0].assumedApr).toEqual(LANDING_VAULTS.find((vault) => vault.id === "sol")!.apr);
    expect(p0[0].pda.mainnet).toBeNull();
  });

  it("binds the LST vault on devnet by its address, and nothing on mainnet yet", () => {
    const lst = "CSzSZKBvA41sv1Ek2bHLZNaPgvmLnXEGyXos3tLeDZWT";
    expect(p0[0].pda).toEqual({ devnet: lst, mainnet: null });
    const served = [{ vault: { vault_pda: lst }, meta: { assetSymbol: "LST" } }];
    expect(resolveLineup(served, { network: "devnet", lineup: p0 })[0].bound).toBe(served[0]);
    expect(resolveLineup(served, { network: "mainnet", lineup: p0 })[0].bound).toBeNull();
  });

  it("reads as LST alone wherever the lineup is put into words", () => {
    expect(lineupAssetsText(p0)).toBe("LST");
    // one vault is said as one vault
    expect(lineupVaultsText(p0)).toBe("an income vault on LST");
    expect(earnDescription(p0)).toBe("An income vault on LST. Deposit what you already hold and earn premium from trading desks. No liquidations.");
    // and the default build's words are unchanged
    expect(lineupVaultsText()).toBe("income vaults on jitoSOL, USDC and TSLA");
    expect(earnDescription()).toBe("Income vaults on jitoSOL, USDC and TSLA. Deposit what you already hold and earn premium from trading desks. No liquidations.");
  });

  it("binds the LST vault by its address, and never a vault on another asset or a test vault on LST", () => {
    const bound = [{ ...p0[0], pda: { devnet: "pda-lst", mainnet: null } }];
    const served = [
      { vault: { vault_pda: "pda-jito" }, meta: { assetSymbol: "jitoSOL" } },
      { vault: { vault_pda: "test-lst" }, meta: { assetSymbol: "LST" } },
      { vault: { vault_pda: "pda-lst" }, meta: { assetSymbol: "LST" } },
    ];
    expect(resolveLineup(served, { network: "devnet", lineup: bound }).map((slot) => slot.bound?.vault.vault_pda)).toEqual(["pda-lst"]);
    expect(resolveLineup(served, { network: "devnet", lineup: p0 }).map((slot) => slot.bound)).toEqual([null]);
  });

  it("is not the default build's lineup, which this build keeps", () => {
    expect(lineupFor("default")).toBe(VAULT_LINEUP);
    expect(lineupFor("default").map((entry) => entry.asset)).toEqual(["jitoSOL", "USDC", "TSLA"]);
  });
});

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

  it("gives a listed vault the lineup's rate and shows it by its asset alone", () => {
    const meta = { name: "LST seller", tagline: "Sells options", assetSymbol: "LST", legs: ["LST", "jitoSOL"], stakingAprPct: 0 } as ResolvedVaultMeta;
    const listed = withLineupName(meta, { ...LINEUP[0], assumedApr: { staking: 7, premium: 11 } });
    expect(listed).toMatchObject({ name: "jitoSOL", legs: ["jitoSOL"], stakingAprPct: 7, assumedApr: { staking: 7, premium: 11 } });
    // an entry with no assumed rate leaves the staking yield it was given
    const plain = withLineupName(meta, { ...LINEUP[0], assumedApr: undefined });
    expect(plain.stakingAprPct).toBe(0);
    expect(plain.assumedApr).toBeUndefined();
  });
});
