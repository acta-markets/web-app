import { describe, expect, it } from "vitest";
import { getToken } from "@/lib/tokens";
import { lineupFor, resolveLineup } from "./lineup";
import { depositorPerformance } from "@acta-markets/ts-sdk/http";
import { finishedCycles } from "./metrics";
import { resolveVaultMeta } from "./registry";
import { stagingText } from "./presentation";
import { isSampleModeEnabled, loadSampleData, makeVault, parseSampleData, peekSampleData } from "./sample";
import sampleFile from "./sample-data.json";

const DAY = 86_400;
// parsing at the file's own anchor applies no shift
const NOW = sampleFile.anchor;

function copyOfFile(): typeof sampleFile {
  return JSON.parse(JSON.stringify(sampleFile));
}

describe("sample mode", () => {
  it("can never turn on in a production build", () => {
    expect(isSampleModeEnabled("production", "1")).toBe(false);
    expect(isSampleModeEnabled("development", "1")).toBe(true);
    expect(isSampleModeEnabled("development", undefined)).toBe(false);
    expect(isSampleModeEnabled("development", "true")).toBe(false);
  });
});

describe("sample-data.json", () => {
  const data = parseSampleData(sampleFile, NOW);
  const usdc = data.keys.usdc;

  it("makes every fixture a whole vault, so no page that reads a served vault breaks on one", () => {
    const fields = Object.keys(makeVault());
    for (const vault of data.vaults) {
      // the file leaves out fields every fixture shares; the loader fills them in
      expect(fields.filter((field) => (vault as Record<string, unknown>)[field] === undefined)).toEqual([]);
      // the vault page's cycle card read `staging.type` and crashed on a fixture without it
      expect(vault.staging).toEqual({ type: "none" });
      expect(stagingText(vault)).toBeNull();
    }
  });

  it("gives every vault a name, cycles and a wallet position", () => {
    expect(data.vaults).toHaveLength(8);
    for (const vault of data.vaults) {
      expect(data.meta[vault.vault_pda]).toBeDefined();
      expect(data.cycles[vault.vault_pda]).toBeDefined();
      expect(data.depositors[vault.vault_pda]).toBeDefined();
    }
    expect(data.depositors[usdc].mainTokenBalance).toBeTypeOf("bigint");
    expect(data.depositors[usdc].depositRequest?.createdAt).toBeTypeOf("bigint");
  });

  it("fills every section, with one vault the backend cannot cover", () => {
    const metas = data.vaults.map((v) => resolveVaultMeta(v, data.meta));
    expect(new Set(metas.map((m) => m.category))).toEqual(new Set(["Crypto", "Stocks", "Stables"]));
    expect(metas.every((m) => m.registered && m.curator === "Velar")).toBe(true);
    expect(data.vaults.every((v) => v.safety === "normal")).toBe(true);
    const uncovered = data.vaults.filter((v) => v.performance?.covered === false);
    expect(uncovered.map((v) => v.vault_pda)).toEqual([data.keys.zec]);
    expect(uncovered[0]).toMatchObject({ generation_started_at: null, premium: null, fees: null, depositors_in_generation: null });
    expect(uncovered[0].performance!.apy_30d).toBeNull();
    const covered = data.vaults.filter((v) => v.performance?.covered);
    expect(covered.every((v) => v.performance!.apy_30d !== null && v.generation_started_at !== null)).toBe(true);
  });

  it("serves the operator metadata on one vault", () => {
    const usdcVault = data.vaults.find((v) => v.vault_pda === usdc)!;
    expect(resolveVaultMeta(usdcVault, data.meta)).toMatchObject({
      name: "USDC",
      strategy: expect.any(String),
      website: expect.stringMatching(/^https:/),
      twitter: expect.any(String),
    });
  });

  it("shows a real token logo for every vault, never the initials fallback", () => {
    const missing = data.vaults
      .map((v) => resolveVaultMeta(v, data.meta).assetSymbol)
      .filter((symbol) => !getToken(symbol)?.logo);
    expect(missing).toEqual([]);
  });

  it("uses the real NVIDIA xStock token for the stock vault", () => {
    const nvda = data.vaults.find((v) => v.vault_pda === data.keys.nvdax)!;
    expect(nvda).toMatchObject({
      main_mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
      main_decimals: 8,
      main_token_program: "token_2022",
    });
    expect(resolveVaultMeta(nvda, data.meta)).toMatchObject({ assetSymbol: "NVDAx", category: "Stocks" });
  });

  it("gives every vault a dollar TVL and capacity matching its cap", () => {
    expect(data.vaults.filter((v) => v.tvl_usd_1e9 === null)).toEqual([]);
    for (const v of data.vaults) {
      expect(["unlimited", "limited"]).toContain(v.capacity.type);
    }
  });

  it("carries the P0 edition's LST vault at its real address, so that lineup binds it here too", () => {
    const lst = data.keys.lst;
    expect(lst).toBe("CSzSZKBvA41sv1Ek2bHLZNaPgvmLnXEGyXos3tLeDZWT");
    const served = data.vaults.map((v) => ({ vault: v, meta: resolveVaultMeta(v, data.meta) }));
    expect(resolveLineup(served, { network: "devnet", lineup: lineupFor("p0") })[0].bound?.vault.vault_pda).toBe(lst);
    // a position with shares and history and nothing pending, so the deposit form is open to type into
    const position = data.depositors[lst];
    expect(position.shareBalance).toBeGreaterThan(0n);
    expect(position.depositRequest).toBeNull();
    expect(data.history[lst].length).toBeGreaterThan(0);
  });

  it("strikes the LST fixture's positions against its own spot and prices its TVL with the same number", () => {
    const lst = data.keys.lst;
    const vault = data.vaults.find((v) => v.vault_pda === lst)!;
    const legs = data.exposure[lst].positions;
    const spot = Number(legs[0].spot) / 1e9;
    for (const leg of legs) {
      const strike = Number(leg.strike) / 1e9;
      expect(leg.underlying_mint).toBe(vault.main_mint);
      expect(leg.distance_pct).toBeCloseTo((Math.abs(strike - spot) / spot) * 100, 2);
      expect(leg.itm).toBe((leg.position_type === "covered_call") === (spot > strike));
    }
    expect(Number(vault.tvl_usd_1e9) / Number(vault.equity)).toBeCloseTo(spot, 2);
    expect(vault.open_positions).toBe(legs.length);
    expect(data.cycles[lst].filter((c) => c.finished_at == null)).toHaveLength(1);
  });

  it("adds jitoSOL's 5% staking to its premium APY", () => {
    const jito = data.vaults.find((v) => v.vault_pda === data.keys.jitosol)!;
    expect(resolveVaultMeta(jito, data.meta).stakingAprPct).toBe(5);
    expect(jito.performance!.apy_30d).toBeGreaterThan(0);
  });

  it("serves exposure with legs in and out of the money and one without a spot", () => {
    const legs = Object.values(data.exposure).flatMap((x) => x.positions);
    expect(legs.some((p) => p.itm === true)).toBe(true);
    expect(legs.some((p) => p.itm === false)).toBe(true);
    const unpriced = Object.values(data.exposure).find((x) => x.positions.some((p) => p.spot === null))!;
    expect(unpriced.totals[0].outstanding_intrinsic).toBeNull();
    expect(data.exposure[data.keys.jitosol].positions).toEqual([]);
  });

  it("gives the USDC position open lots with a return since entry", () => {
    const vault = data.vaults.find((v) => v.vault_pda === usdc)!;
    const perf = depositorPerformance({
      history: data.history[usdc],
      shares: data.depositors[usdc].shareBalance,
      sharePrice: vault.share_price,
      generationStart: vault.generation_started_at!,
    });
    expect(perf.lots).toHaveLength(2);
    expect(perf.lots.reduce((sum, lot) => sum + lot.shares, 0n)).toBe(data.depositors[usdc].shareBalance);
    expect(perf.lots.every((lot) => lot.returnSinceEntryPct !== null)).toBe(true);
  });

  it("never says sample anywhere the UI shows it", () => {
    const shown = data.vaults.flatMap((v) => {
      const meta = resolveVaultMeta(v, data.meta);
      return [meta.name, meta.curator, meta.description ?? "", v.vault_pda, v.share_mint, v.governance, v.main_mint];
    });
    expect(shown.filter((text) => /sample/i.test(text))).toEqual([]);
  });

  it("gives a vault enough history for every metric", () => {
    const cycles = finishedCycles(data.cycles[usdc]);
    // the running cycle carries a provisional return and must not count
    expect(data.cycles[usdc]).toHaveLength(13);
    expect(cycles).toHaveLength(12);
    expect(cycles.some((c) => c.returnPct < 0)).toBe(true);
    expect(data.vaults.find((v) => v.vault_pda === usdc)!.performance!.losing_cycles).toBeGreaterThan(0);
  });

  it("moves every timestamp with the clock, so the data does not go stale", () => {
    const shift = 30 * DAY;
    const later = parseSampleData(sampleFile, NOW + shift);
    const vaultNow = data.vaults.find((v) => v.vault_pda === usdc)!;
    const vaultLater = later.vaults.find((v) => v.vault_pda === usdc)!;
    expect(Number(vaultLater.active_expiry_ts) - Number(vaultNow.active_expiry_ts)).toBe(shift);
    expect(Number(later.cycles[usdc][0].started_at) - Number(data.cycles[usdc][0].started_at)).toBe(shift);
    expect(later.depositors[usdc].depositRequest!.createdAt - data.depositors[usdc].depositRequest!.createdAt).toBe(
      BigInt(shift),
    );
    const shifts = (a: number | null | undefined, b: number | null | undefined) => Number(b) - Number(a);
    expect(shifts(vaultNow.generation_started_at, vaultLater.generation_started_at)).toBe(shift);
    expect(shifts(vaultNow.created_at, vaultLater.created_at)).toBe(shift);
    expect(shifts(vaultNow.price_published_at, vaultLater.price_published_at)).toBe(shift);
    const perfNow = vaultNow.performance!;
    const perfLater = vaultLater.performance!;
    expect(shifts(perfNow.computed_at, perfLater.computed_at)).toBe(shift);
    expect(shifts(perfNow.returns.all!.window_start_at, perfLater.returns.all!.window_start_at)).toBe(shift);
    expect(shifts(perfNow.returns["30d"]!.window_end_at, perfLater.returns["30d"]!.window_end_at)).toBe(shift);
    expect(shifts(data.exposure[usdc].as_of, later.exposure[usdc].as_of)).toBe(shift);
    expect(shifts(data.exposure[usdc].positions[0].expiry_ts, later.exposure[usdc].positions[0].expiry_ts)).toBe(shift);
    expect(shifts(data.exposure[usdc].positions[0].spot_published_at, later.exposure[usdc].positions[0].spot_published_at)).toBe(shift);
    expect(shifts(data.history[usdc][0].occurred_at, later.history[usdc][0].occurred_at)).toBe(shift);
    // 0 means unset on chain and stays that way
    expect(later.vaults.find((v) => v.phase === "idle")!.active_expiry_ts).toBe(0);
    // a month on, the last cycle still finished within the past week
    expect(NOW + shift - finishedCycles(later.cycles[usdc]).at(-1)!.finishedAt).toBeLessThan(7 * DAY);
  });

  it("explains a broken hand edit instead of rendering nonsense", () => {
    const badPhase = copyOfFile();
    badPhase.vaults[0].vault.phase = "sideways";
    expect(() => parseSampleData(badPhase, NOW)).toThrow(
      `sample-data.json: vault "${badPhase.vaults[0].key}": unknown phase "sideways"`,
    );

    const badAmount = copyOfFile();
    badAmount.vaults[0].position.mainTokenBalance = "12.5";
    expect(() => parseSampleData(badAmount, NOW)).toThrow(/expected a base-unit string, got "12\.5"/);

    expect(() => parseSampleData({ vaults: [] }, NOW)).toThrow("expected { anchor, vaults: [...] }");

    const badPerformance = copyOfFile();
    (badPerformance.vaults[0].vault.performance as { covered?: unknown }).covered = "yes";
    expect(() => parseSampleData(badPerformance, NOW)).toThrow("performance.covered must be true or false");

    const badReturns = copyOfFile();
    delete (badReturns.vaults[0].vault.performance.returns as { "90d"?: unknown })["90d"];
    expect(() => parseSampleData(badReturns, NOW)).toThrow("performance.returns needs 7d, 30d, 90d and all");

    const badCapacity = copyOfFile();
    delete (badCapacity.vaults[0].vault as { capacity?: unknown }).capacity;
    expect(() => parseSampleData(badCapacity, NOW)).toThrow("vault.capacity is missing");

    const badExposure = copyOfFile();
    delete (badExposure.vaults[0].exposure as { totals?: unknown }).totals;
    expect(() => parseSampleData(badExposure, NOW)).toThrow("exposure needs positions and totals");

    const badHistory = copyOfFile();
    delete (badHistory.vaults[0].position as { history?: unknown }).history;
    expect(() => parseSampleData(badHistory, NOW)).toThrow("position.history must be an array");

    const badStaking = copyOfFile();
    (badStaking.vaults[0].meta as { stakingAprPct?: unknown }).stakingAprPct = -5;
    expect(() => parseSampleData(badStaking, NOW)).toThrow(/stakingAprPct must be a positive percentage, got -5/);
  });

  it("loads on first use and keeps the result", async () => {
    expect(peekSampleData()).toBeNull();
    const loaded = await loadSampleData();
    expect(loaded.vaults).toHaveLength(8);
    expect(peekSampleData()).toBe(loaded);
    expect(await loadSampleData()).toBe(loaded);
  });
});
