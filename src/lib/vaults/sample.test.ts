import { describe, expect, it } from "vitest";
import { getToken } from "@/lib/tokens";
import { finishedCycles, sharpeRatio, trailingApr } from "./metrics";
import { resolveVaultMeta } from "./registry";
import { isSampleModeEnabled, loadSampleData, parseSampleData, peekSampleData } from "./sample";
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

  it("gives every vault a name, cycles and a wallet position", () => {
    expect(data.vaults).toHaveLength(7);
    for (const vault of data.vaults) {
      expect(data.meta[vault.vault_pda]).toBeDefined();
      expect(data.cycles[vault.vault_pda]).toBeDefined();
      expect(data.depositors[vault.vault_pda]).toBeDefined();
    }
    expect(data.depositors[usdc].mainTokenBalance).toBeTypeOf("bigint");
    expect(data.depositors[usdc].depositRequest?.createdAt).toBeTypeOf("bigint");
  });

  it("fills every section with established vaults", () => {
    const metas = data.vaults.map((v) => resolveVaultMeta(v, data.meta));
    expect(new Set(metas.map((m) => m.category))).toEqual(new Set(["Crypto", "Stocks", "Stables"]));
    expect(metas.every((m) => m.registered && m.curator === "Velar")).toBe(true);
    // no new, closing or half-loaded vaults: every card shows a real APR
    expect(data.vaults.every((v) => v.performance.status === "annualized" && v.safety === "normal")).toBe(true);
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

  it("prices every deposit asset, so each card shows TVL in dollars", () => {
    const unpriced = data.vaults
      .map((v) => resolveVaultMeta(v, data.meta).assetSymbol)
      .filter((symbol) => !(data.pricesUsd[symbol.toUpperCase()] > 0));
    expect(unpriced).toEqual([]);
  });

  it("splits jitoSOL's APR into 5% staking and a 10% premium", () => {
    const jito = data.vaults.find((v) => v.vault_pda === data.keys.jitosol)!;
    expect(resolveVaultMeta(jito, data.meta).stakingAprPct).toBe(5);
    expect(jito.performance.status === "annualized" && jito.performance.annualized_return_pct).toBeCloseTo(10, 2);
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
    expect(sharpeRatio(cycles).value).not.toBeNull();
    expect(trailingApr(cycles, NOW)).not.toBeNull();
  });

  it("moves every timestamp with the clock, so the data does not go stale", () => {
    const shift = 30 * DAY;
    const later = parseSampleData(sampleFile, NOW + shift);
    const vaultNow = data.vaults.find((v) => v.vault_pda === usdc)!;
    const vaultLater = later.vaults.find((v) => v.vault_pda === usdc)!;
    expect(Number(vaultLater.active_expiry) - Number(vaultNow.active_expiry)).toBe(shift);
    expect(Number(later.cycles[usdc][0].started_at) - Number(data.cycles[usdc][0].started_at)).toBe(shift);
    expect(later.depositors[usdc].depositRequest!.createdAt - data.depositors[usdc].depositRequest!.createdAt).toBe(
      BigInt(shift),
    );
    // "0" means unset on chain and stays that way
    expect(later.vaults.find((v) => v.phase === "idle")!.active_expiry).toBe("0");
    // a month on, the 30-day window still has cycles in it
    expect(trailingApr(finishedCycles(later.cycles[usdc]), NOW + shift)).not.toBeNull();
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

    const badPrice = copyOfFile();
    (badPrice.pricesUsd as Record<string, unknown>).USDC = "1";
    expect(() => parseSampleData(badPrice, NOW)).toThrow('sample-data.json: pricesUsd.USDC: expected a positive number, got "1"');

    const badStaking = copyOfFile();
    (badStaking.vaults[0].meta as { stakingAprPct?: unknown }).stakingAprPct = -5;
    expect(() => parseSampleData(badStaking, NOW)).toThrow(/stakingAprPct must be a positive percentage, got -5/);
  });

  it("loads on first use and keeps the result", async () => {
    expect(peekSampleData()).toBeNull();
    const loaded = await loadSampleData();
    expect(loaded.vaults).toHaveLength(7);
    expect(peekSampleData()).toBe(loaded);
    expect(await loadSampleData()).toBe(loaded);
  });
});
