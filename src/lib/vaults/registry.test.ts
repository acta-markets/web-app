import { describe, expect, it } from "vitest";
import { getTokenMint } from "@/lib/tokens";
import {
  VAULT_REGISTRY,
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
      category: "Majors",
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
      category: "Majors",
      assetKnown: true,
      registered: false,
    });
  });

  it("files a stablecoin vault under Stables", () => {
    const usdc = getTokenMint("USDC")!;
    expect(resolveVaultMeta({ vault_pda: "pda-3", main_mint: usdc, governance: GOVERNANCE }, {}).category).toBe("Stables");
  });

  it("puts an unknown deposit asset in Other and names the vault by address", () => {
    const meta = resolveVaultMeta(
      { vault_pda: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", main_mint: "Unknown1111111111111111111111111111111111111", governance: GOVERNANCE },
      {},
    );
    expect(meta).toMatchObject({
      name: "Vault 7xKX…gAsU",
      category: "Other",
      assetKnown: false,
      assetSymbol: "Unkn…1111",
    });
  });

  it("registers the live beta vault", () => {
    expect(VAULT_REGISTRY["3irb63eaXBmm3bvUY7hvpFHnXzeaFZSvtsirPMsfctuS"]).toMatchObject({ category: "Majors" });
  });
});

describe("deriveCategory", () => {
  it.each([
    ["SOL", "Majors"],
    ["jitoSOL", "Majors"],
    ["zBTC", "Majors"],
    ["JLP", "Majors"],
    ["USDC", "Stables"],
    ["PYUSD", "Stables"],
    ["xTSLA", "Stocks"],
    ["TSLAx", "Stocks"],
    ["XRP", "Other"],
    ["BONK", "Other"],
    [undefined, "Other"],
  ] as const)("%s is %s", (symbol, category) => {
    expect(deriveCategory(symbol)).toBe(category);
  });
});

describe("category params", () => {
  it("parses known slugs and defaults to all", () => {
    expect(parseCategoryParam("stables")).toBe("Stables");
    expect(parseCategoryParam("STOCKS")).toBe("Stocks");
    expect(parseCategoryParam(["majors", "stables"])).toBe("Majors");
    expect(parseCategoryParam("nope")).toBe("all");
    expect(parseCategoryParam(undefined)).toBe("all");
  });

  it("round-trips through the href", () => {
    expect(categoryHref("all")).toBe("/earn");
    expect(categoryHref("Stables")).toBe("/earn?category=stables");
  });
});
