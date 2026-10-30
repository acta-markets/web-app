import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("shared network defaults", () => {
  it.each([undefined, "", "devnet", "mainnet", "mainnet-beta", " MAINNET-BETA "])("keeps consumers on the same network for %s, including production", async value => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", value);
    vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "");
    vi.stubEnv("NEXT_PUBLIC_RFQ_WS_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.resetModules();
    const network = await import("./network");
    const tokens = await import("./tokens");
    const { getRfqBackendUrl } = await import("./rfq-client");
    const { getApiBaseUrl } = await import("./vaults/api");
    const { solscanUrl } = await import("./vaults/format");
    const mainnet = value?.trim().toLowerCase().startsWith("mainnet") ?? false;
    const name = mainnet ? "mainnet" : "devnet";
    const host = mainnet ? "beta-api.acta.markets" : "devnet-api.acta.markets";
    expect(network.getNetwork()).toBe(name);
    expect(tokens.getTokenMint("USDC")).toBe(tokens.TOKENS.USDC.mint[name]);
    expect(network.getRpcEndpoint()).toBe(`https://api.${mainnet ? "mainnet-beta" : "devnet"}.solana.com`);
    expect(network.getWalletChain()).toBe(`solana:${name}`);
    expect(getRfqBackendUrl()).toBe(`wss://${host}`);
    expect(getApiBaseUrl()).toBe(`https://${host}`);
    expect(solscanUrl("tx", "signature")).toBe(`https://solscan.io/tx/signature${mainnet ? "" : "?cluster=devnet"}`);
  });
  it("preserves explicit RPC, WS and API overrides", async () => {
    vi.stubEnv("NEXT_PUBLIC_SOLANA_RPC_URL", "https://rpc.example.com");
    vi.stubEnv("NEXT_PUBLIC_RFQ_WS_URL", "wss://rfq.example.com/taker");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { getRpcEndpoint } = await import("./network");
    const { getRfqBackendUrl } = await import("./rfq-client");
    const { getApiBaseUrl } = await import("./vaults/api");
    expect(getRpcEndpoint()).toBe("https://rpc.example.com");
    expect(getRfqBackendUrl()).toBe("wss://rfq.example.com/taker");
    expect(getApiBaseUrl()).toBe("https://rfq.example.com");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://http.example.com/");
    expect(getApiBaseUrl()).toBe("https://http.example.com");
  });
});
