import { describe, expect, it } from "vitest";
import { finishedCycles, sharpeRatio, trailingApr } from "./metrics";
import { resolveVaultMeta } from "./registry";
import { SAMPLE_VAULTS, SAMPLE_VAULT_META, buildSampleData, isSampleModeEnabled } from "./sample";

const NOW = 1_800_000_000;

describe("sample mode", () => {
  it("can never turn on in a production build", () => {
    expect(isSampleModeEnabled("production", "1")).toBe(false);
    expect(isSampleModeEnabled("development", "1")).toBe(true);
    expect(isSampleModeEnabled("development", undefined)).toBe(false);
    expect(isSampleModeEnabled("development", "true")).toBe(false);
  });
});

describe("sample data", () => {
  const data = buildSampleData(NOW);

  it("is deterministic for a given time", () => {
    expect(buildSampleData(NOW)).toEqual(data);
  });

  it("covers every category and the states the UI must handle", () => {
    const metas = data.vaults.map((v) => resolveVaultMeta(v, SAMPLE_VAULT_META));
    expect(metas.every((m) => m.registered)).toBe(true);
    expect(new Set(metas.map((m) => m.category))).toEqual(new Set(["Majors", "Stables", "Stocks"]));
    expect(new Set(data.vaults.map((v) => v.performance.status))).toEqual(
      new Set(["annualized", "short_track_record", "no_track_record", "unavailable"]),
    );
    expect(data.vaults.some((v) => v.main_mint === "So11111111111111111111111111111111111111112")).toBe(true);
    expect(data.vaults.some((v) => v.safety === "closing")).toBe(true);
    expect(data.vaults.some((v) => v.phase === "idle" && !v.accepting_deposits && v.safety === "normal")).toBe(true);
    for (const vault of data.vaults) {
      expect(data.cycles[vault.vault_pda]).toBeDefined();
      expect(data.depositors[vault.vault_pda]).toBeDefined();
    }
  });

  it("never says sample anywhere the UI shows it", () => {
    const shown = data.vaults.flatMap((v) => {
      const meta = resolveVaultMeta(v, SAMPLE_VAULT_META);
      return [meta.name, meta.curator, meta.description ?? "", v.vault_pda, v.share_mint, v.governance, v.main_mint];
    });
    expect(shown.filter((text) => /sample/i.test(text))).toEqual([]);
  });

  it("gives the long-running vault enough history for every metric", () => {
    const cycles = finishedCycles(data.cycles[SAMPLE_VAULTS.sol]);
    // the running cycle carries a provisional return and must not count
    expect(data.cycles[SAMPLE_VAULTS.sol]).toHaveLength(21);
    expect(cycles).toHaveLength(20);
    expect(cycles.some((c) => c.returnPct < 0)).toBe(true);
    expect(sharpeRatio(cycles).value).not.toBeNull();
    expect(trailingApr(cycles, NOW)).not.toBeNull();
  });

  it("restarts the share price on a new capital generation", () => {
    const cycles = [...data.cycles[SAMPLE_VAULTS.sol]].reverse();
    expect(cycles[10].share_price_start).toBe("1000000000");
    expect(cycles[10].capital_generation).toBe("1");
  });
});
