// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as z from "zod";
import { annotationsOf, TOOLS, toolsFor } from "./catalog";
import { HANDLERS } from "./handlers";

describe("tool catalog", () => {
  it("names every tool once, the way MCP clients expect", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^acta_[a-z]+(_[a-z]+)*$/);
  });

  it("has a handler for every tool and no handler without one", () => {
    expect(Object.keys(HANDLERS).sort()).toEqual(TOOLS.map((tool) => tool.name).sort());
  });

  it("serves nothing that asks desks for a price or moves funds without a wallet", () => {
    const hosted = toolsFor("hosted");
    expect(hosted.length).toBeGreaterThan(0);
    expect(hosted.every((tool) => tool.effect === "read")).toBe(true);
    expect(toolsFor("local")).toHaveLength(TOOLS.length);
    for (const tool of TOOLS) if (tool.effect !== "read") expect(tool.surface).toBe("local");
  });

  it("tells a client which tools only read and which can move funds", () => {
    for (const tool of TOOLS) {
      const hints = annotationsOf(tool);
      expect(hints.readOnlyHint).toBe(tool.effect === "read");
      expect(hints.destructiveHint).toBe(tool.effect === "funds");
    }
    expect(TOOLS.filter((tool) => tool.effect === "funds").map((tool) => tool.name)).toEqual([
      "acta_vault_deposit",
      "acta_vault_withdraw",
      "acta_vault_cancel_request",
      "acta_vault_process_request",
      "acta_place_trade",
      "acta_fund_position",
      "acta_withdraw_funding",
    ]);
  });

  it("takes flat inputs only: other agent frameworks rebuild them from JSON Schema", () => {
    for (const tool of TOOLS) {
      const schema = z.toJSONSchema(tool.input) as { type: string; properties?: Record<string, { type?: string; enum?: unknown[] }> };
      expect(schema.type, tool.name).toBe("object");
      for (const [key, property] of Object.entries(schema.properties ?? {})) {
        expect(["string", "number", "integer", "boolean"], `${tool.name}.${key}`).toContain(property.type);
      }
    }
  });

  it("describes every tool and every input in words", () => {
    for (const tool of TOOLS) {
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(tool.summary.length, tool.name).toBeGreaterThan(20);
      const schema = z.toJSONSchema(tool.input) as { properties?: Record<string, { description?: string }> };
      for (const [key, property] of Object.entries(schema.properties ?? {})) {
        expect(property.description, `${tool.name}.${key}`).toBeTruthy();
      }
    }
  });

  it("refuses a trade the schema cannot describe", () => {
    const place = TOOLS.find((tool) => tool.name === "acta_place_trade")!.input;
    const trade = { asset: "BTC", side: "sell", view: "above", strike: 58000, expiry: "2026-11-27", size: 0.001 };
    expect(place.safeParse({ ...trade, limit_premium: 0.5 }).success).toBe(true);
    // no market orders: a trade without a limit is not a trade
    expect(place.safeParse(trade).success).toBe(false);
    expect(place.safeParse({ ...trade, limit_premium: -1 }).success).toBe(false);
    expect(place.safeParse({ ...trade, limit_premium: 1, side: "short" }).success).toBe(false);
    expect(place.safeParse({ ...trade, limit_premium: 1, size: 0 }).success).toBe(false);
  });

  it("says what is wrong with a date or an order id in words a model can act on", () => {
    const said = (name: string, input: unknown) => {
      const result = TOOLS.find((tool) => tool.name === name)!.input.safeParse(input);
      return result.success ? null : result.error.issues.map((issue) => issue.message).join(" ");
    };
    const trade = { asset: "BTC", side: "sell", view: "above", strike: 58000, expiry: "2026-11-27", size: 0.001 };
    expect(said("acta_preview_trade", trade)).toBeNull();
    // the expiry as Unix seconds is taken too
    expect(said("acta_preview_trade", { ...trade, expiry: "1795766400" })).toBeNull();
    expect(said("acta_preview_trade", { ...trade, expiry: "27 November 2026" })).toMatch(/YYYY-MM-DD/);
    expect(said("acta_preview_trade", { ...trade, expiry: "2026-11-27T08:00:00Z" })).toMatch(/YYYY-MM-DD/);
    expect(said("acta_get_order", { order_id: "ab".repeat(32) })).toBeNull();
    expect(said("acta_get_order", { order_id: "abc" })).toMatch(/64 hex characters/);
  });
});
