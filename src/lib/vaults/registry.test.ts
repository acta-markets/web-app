import { describe, expect, it } from "vitest";
import { getToken, getTokenMint } from "@/lib/tokens";
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

  it("falls back to the asset and the governance address without inventing a curator", () => {
    const meta = resolveVaultMeta({ vault_pda: "pda-2", main_mint: SOL_MINT, governance: GOVERNANCE }, {});
    expect(meta).toMatchObject({
      name: "SOL vault",
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
      name: "Vault 7xKX…gAsU",
      category: "Crypto",
      assetKnown: false,
      assetSymbol: "Unkn…1111",
    });
  });

  it("knows the NVIDIA xStock mint as a stock", () => {
    const meta = resolveVaultMeta(
      { vault_pda: "pda-4", main_mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", governance: GOVERNANCE },
      {},
    );
    expect(meta).toMatchObject({ assetSymbol: "NVDAx", assetKnown: true, category: "Stocks", name: "NVDAx vault" });
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
