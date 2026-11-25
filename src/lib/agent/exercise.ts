import { ALL_POSITIONS, type PositionInfo } from "@acta-markets/ts-sdk/ws";
import type { Rpc, SolanaRpcApiMainnet } from "@solana/kit";
import { buildBuyDepositInstructions, buildBuyWithdrawInstructions } from "@/lib/trade/buy-deposit";
import { explorerUrl } from "./config";
import { AgentError, plainSymbol, toAgentError } from "./errors";
import { isoTime, optionName } from "./markets";
import { sendFromWallet } from "./send";
import type { AgentContext } from "./trade";

const PRICE_SCALE = 1_000_000_000;

/**
 * Funding a bought option, and taking the funding back. A bought call or put pays out only if
 * its holder has paid in what exercising costs before expiry: the strike's worth of the quote
 * token for a call, the asset itself for a put. Until expiry the funding can be withdrawn.
 */

async function ownPosition(ctx: AgentContext, pda: string): Promise<PositionInfo> {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pda)) throw new AgentError("invalid_position", "position is the position's address, as acta_list_positions gives it.");
  const client = await ctx.session.connect();
  // The venue's list is the wallet's own positions, so finding it there is also the ownership check.
  const data = await client
    .getPositionsPageAsync({ ...ALL_POSITIONS, status: ["open", "funded"], limit: 200 }, { applyToState: false })
    .catch((error) => {
      throw toAgentError(error);
    });
  const position = data.positions.find((p) => p.pda === pda);
  if (!position) throw new AgentError("unknown_position", "This wallet has no open position at that address.", "fix_request");
  if (position.side !== "buy" || !("strike" in position.terms) || (position.terms.type !== "covered_call" && position.terms.type !== "cash_secured_put")) {
    throw new AgentError("not_fundable", "Only a bought call or put is funded. A sold option was backed when it was sold, and a spread settles in cash.", "stop");
  }
  return position;
}

/** What exercising this position costs, in whole tokens: the quote token for a call, the asset for a put. */
function fundingOf(position: PositionInfo) {
  const size = Number(position.quantity) / 10 ** position.underlying_decimals;
  const strike = "strike" in position.terms ? Number(position.terms.strike) / PRICE_SCALE : 0;
  const isPut = position.terms.type === "cash_secured_put";
  return {
    size,
    strike,
    usd: size * strike,
    amount: isPut ? size : Number((size * strike).toFixed(position.quote_decimals)),
    token: (isPut ? plainSymbol(position.underlying_symbol) : plainSymbol(position.quote_symbol)) ?? "token",
  };
}

function describe(position: PositionInfo) {
  const funding = fundingOf(position);
  return {
    position: position.pda,
    option: optionName(position.terms.type, position.side),
    asset: plainSymbol(position.underlying_symbol) ?? "asset",
    strike: funding.strike,
    size: funding.size,
    expiry: isoTime(Number(position.expiry_ts)),
  };
}

export async function fundPosition(ctx: AgentContext, input: { position: string }) {
  const { session, limits } = ctx;
  if (limits.readOnly) throw new AgentError("read_only", "This agent is set to read only: it cannot fund a position.", "stop");
  const position = await ownPosition(ctx, input.position);
  const funding = fundingOf(position);
  const asset = plainSymbol(position.underlying_symbol) ?? "";
  if (limits.allowedAssets && !limits.allowedAssets.includes(asset.toUpperCase())) {
    throw new AgentError("asset_not_allowed", `This agent may only trade ${limits.allowedAssets.join(", ")}.`, "stop");
  }
  if (funding.usd > limits.maxTradeUsd) {
    throw new AgentError("over_trade_limit", `Funding this takes $${funding.usd.toFixed(2)}; the limit per trade is $${limits.maxTradeUsd}.`, "stop", { limit_usd: limits.maxTradeUsd });
  }
  if (position.state === "funded") throw new AgentError("already_funded", "This position is already funded.", "stop");
  if (Number(position.expiry_ts) <= session.nowSec()) throw new AgentError("expired", "This option has expired; it can no longer be funded.", "stop");

  const signer = session.signer!;
  const instructions = await buildBuyDepositInstructions(session.rpc as unknown as Rpc<SolanaRpcApiMainnet>, signer.address, {
    pda: position.pda,
    market: position.market_pda,
  }).catch((error) => {
    throw new AgentError("chain_unreadable", `The position could not be read from chain: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`, "retry");
  });
  const signature = await sendFromWallet(session, instructions);
  return {
    status: "funded",
    network: session.config.network,
    ...describe(position),
    paid_in: { amount: funding.amount, token: funding.token },
    transaction: explorerUrl(session.config, "tx", signature),
    note: "At expiry the option is exercised only if that is worth it; otherwise what was paid in comes back. Until expiry it can be taken back with acta_withdraw_funding.",
  };
}

export async function withdrawFunding(ctx: AgentContext, input: { position: string }) {
  const { session, limits } = ctx;
  if (limits.readOnly) throw new AgentError("read_only", "This agent is set to read only.", "stop");
  const position = await ownPosition(ctx, input.position);
  if (position.state !== "funded") throw new AgentError("not_funded", "This position is not funded, so there is nothing to take back.", "stop");
  if (Number(position.expiry_ts) <= session.nowSec()) throw new AgentError("expired", "This option has expired; its funding settles with it.", "stop");

  const funding = fundingOf(position);
  const signer = session.signer!;
  const instructions = await buildBuyWithdrawInstructions(session.rpc as unknown as Rpc<SolanaRpcApiMainnet>, signer.address, {
    pda: position.pda,
    market: position.market_pda,
  }).catch((error) => {
    throw new AgentError("chain_unreadable", `The position could not be read from chain: ${error instanceof Error ? error.message.slice(0, 120) : "unknown"}`, "retry");
  });
  const signature = await sendFromWallet(session, instructions);
  return {
    status: "withdrawn",
    network: session.config.network,
    ...describe(position),
    returned: { amount: funding.amount, token: funding.token },
    transaction: explorerUrl(session.config, "tx", signature),
    note: "The option is open and unfunded again: it will not be exercised unless it is funded before expiry.",
  };
}
