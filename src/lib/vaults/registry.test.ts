import { describe, expect, it } from "vitest";
import { getToken, getTokenMint, rememberReferenceTokens } from "@/lib/tokens";
import { mintUnits } from "./presentation";
import { makeVault } from "./sample";
import {
  categoryHref,
  deriveCategory,
  parseCategoryParam,
  resolveVaultMeta,
} from "./registry";

const GOVERNANCE = "9amKA1ezPyPoYik7N1QCBE4N3d9mm2fQfmFfLNbSSbUf";
const SOL_MINT = "So11111111111111111111111111111111111111112";

describe("resolveVaultMeta", () => {
  it("uses the registry entry when there is one", () => {
    const meta = resolveVaultMeta(
      { vault_pda: "pda-1", main_mint: SOL_MINT, governance: GOVERNANCE },
      { "pda-1": { name: "SOL desk", curator: "Acta", description: "Weekly calls" } },
    );
    expect(meta).toMatchObject({
      name: "SOL desk",
      curator: "Acta",
      curatorIsAddress: false,
      category: "Crypto",
      assetSymbol: "SOL",
      registered: true,
      description: "Weekly calls",
    });
  });

  it("prefers the backend's metadata and keeps the governance address when it names no curator", () => {
    const vault = { vault_pda: "pda-1", main_mint: SOL_MINT, governance: GOVERNANCE };
    const fixture = { "pda-1": { name: "SOL desk", curator: "Acta", description: "Weekly calls" } };
    expect(resolveVaultMeta({ ...vault, metadata: { name: "SOL income", curator: "Desk" } }, fixture)).toMatchObject({
      name: "SOL income",
      curator: "Desk",
      curatorIsAddress: false,
      description: "Weekly calls",
      registered: true,
    });
    expect(resolveVaultMeta({ ...vault, metadata: { name: "SOL income" } }, {})).toMatchObject({
      name: "SOL income",
      curator: "9amK…SbUf",
      curatorIsAddress: true,
      registered: true,
    });
  });

  it("passes curator links only when they are https URLs and a bare handle", () => {
    const vault = { vault_pda: "pda-1", main_mint: SOL_MINT, governance: GOVERNANCE };
    const good = resolveVaultMeta({ ...vault, metadata: {
      name: "SOL income", strategy: "Weekly calls", website: "https://acta.markets",
      twitter: "acta_markets", logo_url: "https://acta.markets/logo.png",
    } }, {});
    expect(good).toMatchObject({
      strategy: "Weekly calls", website: "https://acta.markets",
      twitter: "acta_markets", logoUrl: "https://acta.markets/logo.png",
    });
    const bad = resolveVaultMeta({ ...vault, metadata: {
      name: "SOL income", website: "javascript:alert(1)", twitter: "@acta", logo_url: "http://acta.markets/logo.png",
    } }, {});
    expect(bad.website).toBeUndefined();
    expect(bad.twitter).toBeUndefined();
    expect(bad.logoUrl).toBeUndefined();
  });

  it("falls back to the asset and the governance address without inventing a curator", () => {
    const meta = resolveVaultMeta({ vault_pda: "pda-2", main_mint: SOL_MINT, governance: GOVERNANCE }, {});
    expect(meta).toMatchObject({
      name: "SOL vault · pda-2",
      curator: "9amK…SbUf",
      curatorIsAddress: true,
      category: "Crypto",
      assetKnown: true,
      registered: false,
    });
  });

  it("files a stablecoin vault under Stables", () => {
    const usdc = getTokenMint("USDC")!;
    expect(resolveVaultMeta({ vault_pda: "pda-3", main_mint: usdc, governance: GOVERNANCE }, {}).category).toBe("Stables");
  });

  it("treats an unknown deposit asset as crypto and names the vault by address", () => {
    const meta = resolveVaultMeta(
      { vault_pda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", main_mint: "Unknown1111111111111111111111111111111111111", governance: GOVERNANCE },
      {},
    );
    expect(meta).toMatchObject({
      name: "Unknown token (Unkn…1111) vault · 7xKX…gAsU",
      category: "Crypto",
      assetKnown: false,
      assetSymbol: "Unknown token (Unkn…1111)",
    });
  });

  it("knows the NVIDIA xStock mint as a stock", () => {
    const meta = resolveVaultMeta(
      { vault_pda: "pda-4", main_mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", governance: GOVERNANCE },
      {},
    );
    expect(meta).toMatchObject({ assetSymbol: "NVDAx", assetKnown: true, category: "Stocks", name: "NVDAx vault · pda-4" });
    expect(getToken("NVDAx")?.logo).toBe("/tokens/nvdax.png");
  });

  it.each([
    ["98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g", "HYPE", "Crypto", "/tokens/hype.png"],
    ["A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS", "ZEC", "Crypto", "/tokens/zec.svg"],
    ["XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W", "SPYx", "Stocks", "/tokens/spyx.png"],
    ["SPCXxcqXj6e5dJDVNovHN8744zkbhM2bYudU45BimGb", "SPCX", "Stocks", "/tokens/spcx.svg"],
  ] as const)("knows %s as %s", (mint, symbol, category, logo) => {
    expect(resolveVaultMeta({ vault_pda: "pda-5", main_mint: mint, governance: GOVERNANCE }, {})).toMatchObject({
      assetSymbol: symbol,
      assetKnown: true,
      category,
    });
    expect(getToken(symbol)?.logo).toBe(logo);
  });
});

describe("deriveCategory", () => {
  it.each([
    ["SOL", "Crypto"],
    ["jitoSOL", "Crypto"],
    ["zBTC", "Crypto"],
    ["JLP", "Crypto"],
    ["USDC", "Stables"],
    ["PYUSD", "Stables"],
    ["xTSLA", "Stocks"],
    ["TSLAx", "Stocks"],
    ["SPCX", "Stocks"],
    ["XRP", "Crypto"],
    ["BONK", "Crypto"],
    [undefined, "Crypto"],
  ] as const)("%s is %s", (symbol, category) => {
    expect(deriveCategory(symbol)).toBe(category);
  });
});

describe("category params", () => {
  it("parses known slugs and defaults to all", () => {
    expect(parseCategoryParam("stables")).toBe("Stables");
    expect(parseCategoryParam("STOCKS")).toBe("Stocks");
    expect(parseCategoryParam(["crypto", "stables"])).toBe("Crypto");
    expect(parseCategoryParam("nope")).toBe("all");
    expect(parseCategoryParam(undefined)).toBe("all");
  });

  it("round-trips through the href", () => {
    expect(categoryHref("all")).toBe("/earn");
    expect(categoryHref("Stables")).toBe("/earn?category=stables");
  });
});

describe("reference tokens", () => {
  it("names a vault whose deposit mint only the API's token list knows", () => {
    const pt = "DSVwUv5iRHVgscHSRm1r9qE3eXw8hpuBDHdcWX9v1729";
    rememberReferenceTokens([{ mint: pt, symbol: "PTd1", decimals: 9 }]);
    const vault = makeVault({ main_mint: pt, main_decimals: 9, metadata: undefined });
    const meta = resolveVaultMeta(vault, {});
    expect(meta.assetSymbol).toBe("PTd1");
    expect(meta.name).toBe("PTd1 / SOL vault · 1111…1111");
    expect(mintUnits(makeVault(), pt)).toEqual({ symbol: "PTd1", decimals: 9 });
  });
});
