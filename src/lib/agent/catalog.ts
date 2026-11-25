import * as z from "zod";
import { TOOL_LIST, type ToolInfo, type ToolSurface } from "./tools";

/**
 * What each tool takes. The list of tools is `tools.ts`; this adds the schema an input is
 * checked against before a handler sees it.
 *
 * Inputs are flat objects of strings, numbers, booleans and enums. Other agent frameworks
 * rebuild these schemas from JSON Schema, and a nested or unioned input would not survive that.
 */
export type ToolSpec = ToolInfo & { input: z.ZodObject };

const asset = z.string().min(1).max(12).describe("Asset symbol as acta_list_assets gives it, e.g. BTC");
const side = z.enum(["sell", "buy"]).describe("sell: deposit and get paid a premium now. buy: pay a premium for the right to trade at the strike");
const view = z.enum(["above", "below"]).describe("Where you believe the price will be at expiry, relative to the strike");
const strike = z.number().positive().describe("The price in the sentence, in dollars. Must be a strike acta_get_market lists for that date");
const expiry = z.string().min(8).max(12).describe("The date in the sentence, YYYY-MM-DD, as acta_get_market lists it");
const size = z.number().positive().describe("How much of the asset the option is on, in whole units of the asset (0.1 means 0.1 BTC)");

const trade = { asset, side, view, strike, expiry, size };

const INPUTS: Record<string, z.ZodObject> = {
  acta_status: z.object({}),
  acta_list_assets: z.object({}),
  acta_get_market: z.object({
      asset,
      side: side.optional(),
      view: view.optional(),
      expiry: expiry.optional(),
    }),
  acta_list_vaults: z.object({}),
  acta_get_vault: z.object({ vault: z.string().min(32).max(44).describe("The vault's address, as acta_list_vaults gives it") }),
  acta_preview_trade: z.object(trade),
  acta_place_trade: z.object({
      ...trade,
      limit_premium: z.number().min(0).describe("In the quote token, for the whole trade: the minimum to receive when selling, the maximum to pay when buying"),
      dry_run: z.boolean().optional().describe("true: quote and check the limit, trade nothing"),
    }),
  acta_fund_position: z.object({ position: z.string().min(32).max(44).describe("The position's address, as acta_list_positions gives it") }),
  acta_withdraw_funding: z.object({ position: z.string().min(32).max(44).describe("The position's address, as acta_list_positions gives it") }),
  acta_list_positions: z.object({ status: z.enum(["open", "closed", "all"]).optional().describe("open (default), closed, or all") }),
  acta_get_order: z.object({ order_id: z.string().length(64).describe("The order_id acta_place_trade returned") }),
};

export const TOOLS: ReadonlyArray<ToolSpec> = TOOL_LIST.map((tool) => {
  const input = INPUTS[tool.name];
  if (!input) throw new Error(`Tool ${tool.name} has no input schema`);
  return { ...tool, input };
});

export function toolsFor(surface: ToolSurface): ToolSpec[] {
  return TOOLS.filter((tool) => surface === "local" || tool.surface === "hosted");
}

export { annotationsOf, SERVER_INSTRUCTIONS } from "./tools";
export type { ToolEffect, ToolSurface } from "./tools";
