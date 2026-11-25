import { TOKEN_PROGRAM_ID } from "@acta-markets/ts-sdk/chain";
import { address } from "@solana/kit";
import { plainSymbol } from "./errors";
import { remainingToday } from "./limits";
import { unsettledOrders } from "./journal";
import type { AgentContext } from "./trade";

const LAMPORTS_PER_SOL = 1_000_000_000;
/** How long a status waits for devnet to fund a wallet that holds nothing: 6 checks, 2 s apart. */
const FUNDING_CHECKS = 6;
const FUNDING_CHECK_MS = 2_000;

type ParsedTokenAccount = {
  account: { data: { parsed?: { info?: { mint?: string; tokenAmount?: { uiAmountString?: string } } } } };
};

/** What the venue's tokens the wallet holds, by symbol. Tokens the venue does not list are left out. */
async function balances(ctx: AgentContext, wallet: string) {
  const { session } = ctx;
  const owner = address(wallet);
  const [sol, accounts, tokens] = await Promise.all([
    session.rpc.getBalance(owner).send(),
    session.rpc.getTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }, { encoding: "jsonParsed" }).send(),
    session.tokens(),
  ]);
  const symbols = new Map(tokens.map((t) => [String(t.mint), plainSymbol(t.symbol)]));
  const held: Record<string, number> = {};
  for (const { account } of accounts.value as unknown as ParsedTokenAccount[]) {
    const info = account.data.parsed?.info;
    const symbol = info?.mint ? symbols.get(info.mint) : null;
    const amount = Number(info?.tokenAmount?.uiAmountString ?? 0);
    if (symbol && amount > 0) held[symbol] = (held[symbol] ?? 0) + amount;
  }
  return { SOL: Number(sol.value) / LAMPORTS_PER_SOL, ...held };
}

/** Where the agent stands before it does anything: the network, the venue, its wallet and what it is allowed. */
export async function status(ctx: AgentContext) {
  const { session, limits, journal } = ctx;
  const { config, signer } = session;
  const health = await fetch(`${config.apiUrl}/health`, { headers: { Accept: "application/json" } })
    .then(async (response) => (response.ok ? ((await response.json()) as { verdict?: string }).verdict ?? "unknown" : `http_${response.status}`))
    .catch(() => "unreachable");

  const base = {
    network: config.network,
    funds: "Test funds only. Nothing here is real money.",
    venue: { health: health === "pass" ? "ok" : health, api: config.apiUrl, site: config.siteUrl },
  };
  if (!signer) {
    return { ...base, wallet: null, can_trade: false, note: "Read only: this server has no wallet. The server you run on your own machine has one and can trade." };
  }

  // Signing in is what makes the venue know the wallet; on devnet it also funds a new one.
  const connected = await session.connect().then(() => null, (error: Error) => error.message);
  const entries = await journal.read();
  let held = await balances(ctx, signer.address).catch(() => null);
  // Devnet funds a new wallet moments after its first sign-in, SOL first and the tokens after.
  // Wait for that, once per run, so the first status an owner sees is not an empty wallet.
  const empty = () => held !== null && Object.keys(held).every((symbol) => symbol === "SOL");
  const wait = connected === null && !ctx.fundingAwaited;
  ctx.fundingAwaited = true;
  for (let attempt = 0; wait && empty() && attempt < FUNDING_CHECKS; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, FUNDING_CHECK_MS));
    held = await balances(ctx, signer.address).catch(() => held);
  }
  return {
    ...base,
    wallet: {
      address: signer.address,
      signed_in: connected === null,
      ...(connected ? { sign_in_error: connected } : {}),
      invite_required: session.inviteRequired,
      balances: held,
      balances_note: !held
        ? "Balances could not be read from the RPC right now."
        : empty()
          ? "The wallet holds none of the venue's tokens yet. Devnet funds a new wallet shortly after its first sign-in: call acta_status again in a minute."
          : undefined,
    },
    can_trade: connected === null && !session.inviteRequired && !limits.readOnly,
    limits: {
      read_only: limits.readOnly,
      max_trade_usd: limits.maxTradeUsd,
      daily_usd: limits.dailyUsd,
      remaining_today_usd: Number(remainingToday(limits, entries, signer.address, session.nowSec()).toFixed(2)),
      allowed_assets: limits.allowedAssets ?? "all listed",
      counted_as: "strike times size for a trade and for funding a bought option; a vault deposit by its dollar value",
    },
    unsettled_orders: unsettledOrders(entries, signer.address).map((e) => e.orderId),
  };
}
