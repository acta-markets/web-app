import type { ToolSpec } from "./catalog";
import { AgentError } from "./errors";
import { fundPosition, withdrawFunding } from "./exercise";
import { getMarket, listAssets } from "./markets";
import { listPositions } from "./positions";
import { status } from "./status";
import { getOrder, placeTrade, previewTrade, type AgentContext, type PlaceInput, type TradeInput } from "./trade";
import { getVault, listVaults } from "./vaults";

// Inputs arrive already checked against the tool's schema in the catalog.
type Handler = (ctx: AgentContext, input: never) => Promise<unknown>;

/** What each tool in the catalog does. A test holds the two lists to each other. */
export const HANDLERS: Record<string, Handler> = {
  acta_status: (ctx) => status(ctx),
  acta_list_assets: (ctx) => listAssets(ctx.session),
  acta_get_market: (ctx, input: Parameters<typeof getMarket>[1]) => getMarket(ctx.session, input),
  acta_list_vaults: (ctx) => listVaults(ctx.session),
  acta_get_vault: (ctx, input: { vault: string }) => getVault(ctx.session, input),
  acta_preview_trade: (ctx, input: TradeInput) => previewTrade(ctx, input),
  acta_place_trade: (ctx, input: PlaceInput) => placeTrade(ctx, input),
  acta_fund_position: (ctx, input: { position: string }) => fundPosition(ctx, input),
  acta_withdraw_funding: (ctx, input: { position: string }) => withdrawFunding(ctx, input),
  acta_list_positions: (ctx, input: { status?: "open" | "closed" | "all" }) => listPositions(ctx, input),
  acta_get_order: (ctx, input: { order_id: string }) => getOrder(ctx, input.order_id),
};

/**
 * Runs one tool. The wallet rule is here and not in a client's reading of an annotation: a
 * tool that needs the agent's key refuses on a context that has none, whoever asks.
 */
export async function runTool(ctx: AgentContext, tool: ToolSpec, input: unknown): Promise<unknown> {
  const handler = HANDLERS[tool.name];
  if (!handler) throw new AgentError("unknown_tool", "No such tool.", "stop");
  if (tool.surface === "local" && !ctx.session.signer) {
    throw new AgentError("no_wallet", "This tool needs a wallet. Use the Acta MCP server that runs on your own machine: it has one.", "stop");
  }
  return handler(ctx, input as never);
}
