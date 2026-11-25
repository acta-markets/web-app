// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getDeploymentContext } from "@/lib/agent-discovery";
import { getOpenApiDocument } from "@/lib/openapi";

const document = getOpenApiDocument(getDeploymentContext("https://devnet.acta.markets/openapi.json"));
const schemas = document.components.schemas;

function refsIn(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((item) => refsIn(item, found));
  else if (value && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      if (key === "$ref" && typeof inner === "string") found.push(inner);
      else refsIn(inner, found);
    }
  }
  return found;
}

describe("OpenAPI document", () => {
  it("names the markets filters the backend accepts", () => {
    // The backend answers 400 to a filter it does not know, so an old name is not a silent no-op.
    const names = document.paths["/api/v1/markets"].get.parameters.map((p) => ("name" in p ? p.name : p.$ref));
    expect(names).toEqual([
      "underlying_mint",
      "quote_mint",
      "expiry_ts",
      "is_put",
      "active",
      "#/components/parameters/Limit",
      "#/components/parameters/Cursor",
    ]);
  });

  it("describes a market, a maker and the venue by their current fields", () => {
    expect(schemas.Market.required).toEqual(
      expect.arrayContaining(["underlying_mint", "quote_mint", "settlement", "products"]),
    );
    expect(Object.keys(schemas.Market.properties)).not.toContain("settlement_price");
    expect(schemas.Maker.required).toContain("maker_owner");
    expect(Object.keys(schemas.Maker.properties)).not.toContain("owner");
    expect(Object.keys(schemas.Venue.properties).some((name) => name.startsWith("protocol_fee_bps"))).toBe(false);
  });

  it("sends amounts as decimal text", () => {
    expect(schemas.Amount.type).toBe("string");
  });

  it("declares GET only, each operation once, and resolves every reference", () => {
    const operationIds: string[] = [];
    for (const item of Object.values(document.paths)) {
      expect(Object.keys(item)).toEqual(["get"]);
      operationIds.push(item.get.operationId);
    }
    expect(new Set(operationIds).size).toBe(operationIds.length);

    for (const reference of refsIn(document)) {
      const [, , group, name] = reference.split("/");
      expect(document.components[group as "schemas" | "parameters"], reference).toHaveProperty([name]);
    }
  });
});
