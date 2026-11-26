import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Hard rule (AGENTS.md): builds of the `devnet` branch always target the devnet
 * backend, whatever the Vercel project's variables say.
 */
async function configEnvFor(branch: string | undefined) {
  vi.resetModules();
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", branch ?? "");
  // @ts-expect-error -- next.config.mjs is plain JavaScript with no declaration file
  const { default: config } = await import("../../next.config.mjs");
  return config.env as Record<string, string>;
}

describe("devnet branch build environment", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("forces devnet and blanks every backend override on the devnet branch", async () => {
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_RFQ_WS_URL", "wss://beta-api.acta.markets");

    expect(await configEnvFor("devnet")).toEqual({
      NEXT_PUBLIC_SOLANA_NETWORK: "devnet",
      NEXT_PUBLIC_RFQ_WS_URL: "",
      NEXT_PUBLIC_API_URL: "",
      NEXT_PUBLIC_SOLANA_RPC_URL: "",
    });
  });

  it("holds the p0 branch to devnet too, and turns the P0 edition on there only", async () => {
    vi.stubEnv("NEXT_PUBLIC_SOLANA_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_RFQ_WS_URL", "wss://beta-api.acta.markets");

    expect(await configEnvFor("p0")).toEqual({
      NEXT_PUBLIC_SOLANA_NETWORK: "devnet",
      NEXT_PUBLIC_RFQ_WS_URL: "",
      NEXT_PUBLIC_API_URL: "",
      NEXT_PUBLIC_SOLANA_RPC_URL: "",
      NEXT_PUBLIC_EDITION: "p0",
    });
    expect(await configEnvFor("devnet")).not.toHaveProperty("NEXT_PUBLIC_EDITION");
  });

  it("leaves other branches and local builds alone", async () => {
    expect(await configEnvFor("main")).toEqual({});
    expect(await configEnvFor("p0-something")).toEqual({});
    expect(await configEnvFor("constructor")).toEqual({});
    expect(await configEnvFor(undefined)).toEqual({});
  });
});
