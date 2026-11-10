import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function loadDisplayQuoteSymbol(network: string) {
  vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", network);
  vi.resetModules();
  return (await import("./tokens")).displayQuoteSymbol;
}

describe("displayQuoteSymbol", () => {
  it("shows the devnet quote as plain USDC, whatever casing the server sends", async () => {
    const f = await loadDisplayQuoteSymbol("devnet");
    expect(f("USDC-Dev")).toBe("USDC");
    expect(f("USDC-DEV")).toBe("USDC");
    expect(f("USDC-dev")).toBe("USDC");
    expect(f("USDC - Dev")).toBe("USDC");
    expect(f("USDC")).toBe("USDC");
    expect(f(undefined)).toBe("USDC");
  });

  it("reads USDC on mainnet", async () => {
    const f = await loadDisplayQuoteSymbol("mainnet");
    expect(f("USDC")).toBe("USDC");
    expect(f("USDC-Dev")).toBe("USDC");
    expect(f(undefined)).toBe("USDC");
  });

  it("passes a non-USDC quote through unchanged", async () => {
    const f = await loadDisplayQuoteSymbol("devnet");
    expect(f("USDT")).toBe("USDT");
    expect(f("eur")).toBe("EUR");
  });
});
