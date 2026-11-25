import { ALL_POSITIONS, totalPremiumQuoteAtoms, type PositionInfo } from "@acta-markets/ts-sdk/ws";
import { AgentError, plainSymbol, toAgentError } from "./errors";
import { isoTime, optionName } from "./markets";
import type { AgentContext } from "./trade";

const PRICE_SCALE = 1_000_000_000;

function row(position: PositionInfo, nowSec: number) {
  const asset = plainSymbol(position.underlying_symbol) ?? "asset";
  const quote = plainSymbol(position.quote_symbol) ?? "quote token";
  const strike = "strike" in position.terms
    ? Number(position.terms.strike) / PRICE_SCALE
    : Number(position.terms.lower_strike) / PRICE_SCALE;
  const expiry = Number(position.expiry_ts);
  const bought = position.side === "buy";
  const open = position.state === "open" || position.state === "funded";
  // The chain records the premium after the protocol fee: what a seller received. A buyer paid
  // the gross price, so theirs is the price times the size.
  const premiumAtoms = bought
    ? totalPremiumQuoteAtoms(position.price, position.quantity, position.underlying_decimals, position.quote_decimals)
    : BigInt(position.total_premium);
  return {
    position: position.pda,
    asset,
    option: optionName(position.terms.type, position.side),
    side: position.side,
    strike,
    size: Number(position.quantity) / 10 ** position.underlying_decimals,
    premium: {
      amount: Number(premiumAtoms) / 10 ** position.quote_decimals,
      token: quote,
      direction: bought ? "you paid" : "you received",
    },
    expiry: isoTime(expiry),
    state: position.state,
    price_now: position.underlying_price.type === "available" ? Number(position.underlying_price.price) / PRICE_SCALE : null,
    // A bought option pays out only if it is funded before expiry; an unfunded one expires unused.
    needs_funding_to_exercise: bought && position.state === "open" && expiry > nowSec,
    ...(open ? {} : { settled: position.state === "settled" ? position.settlement.type : position.state }),
  };
}

/** The wallet's positions, newest page first: `open` are live, `closed` are settled or liquidated. */
export async function listPositions(ctx: AgentContext, input: { status?: "open" | "closed" | "all" }) {
  const { session } = ctx;
  if (!session.signer) throw new AgentError("no_wallet", "This server has no wallet, so it has no positions to list.", "stop");
  const client = await session.connect();
  const status = input.status ?? "open";
  const data = await client
    .getPositionsPageAsync(
      {
        ...ALL_POSITIONS,
        status: status === "open" ? ["open", "funded"] : status === "closed" ? ["settled", "liquidated"] : [],
        limit: 50,
      },
      { applyToState: false },
    )
    .catch((error) => {
      throw toAgentError(error);
    });
  const now = session.nowSec();
  return {
    network: session.config.network,
    wallet: session.signer.address,
    showing: status,
    positions: data.positions.map((p) => row(p, now)),
    more: data.next_cursor != null,
  };
}
