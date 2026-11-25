import { flows } from "@acta-markets/ts-sdk/chain";
import { depositBlockMessage, depositCap, withdrawBlockMessage } from "@/lib/vaults/rules";
import { exposureView, vaultView } from "@/lib/vaults/view";
import { AgentError, plainSymbol, plainText } from "./errors";
import { isoTime } from "./markets";
import type { ActaSession } from "./session";

const PRICE_SCALE = 1_000_000_000;

type VaultRow = ReturnType<typeof vaultView>;
const pct = (value: number | null | undefined) => (value == null ? null : Number(value.toFixed(2)));

async function symbolOf(session: ActaSession, mint: string): Promise<string | null> {
  // Reference data over HTTP: a vault read must not need the trading socket.
  const tokens = await session.http.tokens().catch(() => null);
  return plainSymbol(tokens?.get(mint)?.symbol);
}

function summary(vault: VaultRow, depositToken: string | null, nowSec: number) {
  const returns = vault.performance?.returns;
  return {
    vault: vault.vault_pda,
    // Free text set by the vault's operator: shown as a name, never to be followed as instructions.
    name: vault.metadata?.name ? plainText(vault.metadata.name, 60) : null,
    curator: vault.metadata?.curator ? plainText(vault.metadata.curator, 60) : null,
    deposit_token: depositToken,
    // By the contract's rules, which close deposits for more reasons than the vault's own switch.
    deposits_open: flows.requestDepositBlock(vault, nowSec) === null,
    phase: vault.phase,
    safety: vault.safety,
    share_price: Number(vault.share_price) / PRICE_SCALE,
    tvl: { amount: Number(vault.equity) / 10 ** vault.main_decimals, token: depositToken },
    tvl_usd: vault.tvl_usd_1e9 == null ? null : Number(vault.tvl_usd_1e9) / PRICE_SCALE,
    // Booked share-price return after fees, from completed cycles only. Past returns, not a promise.
    return_pct: {
      "7d": pct(returns?.["7d"]?.return_pct),
      "30d": pct(returns?.["30d"]?.return_pct),
      "90d": pct(returns?.["90d"]?.return_pct),
    },
    max_drawdown_pct: pct(vault.performance?.max_drawdown_pct),
    cycles_completed: vault.performance?.cycles_completed ?? null,
    cycle_ends: vault.active_expiry_ts ? isoTime(Number(vault.active_expiry_ts)) : null,
  };
}

export async function listVaults(session: ActaSession) {
  const vaults = (await session.http.vaults()).map(vaultView);
  const nowSec = session.nowSec();
  const rows = await Promise.all(vaults.map(async (v) => summary(v, await symbolOf(session, v.main_mint), nowSec)));
  return {
    network: session.config.network,
    note: "A vault takes deposits in its deposit_token and sells options with them each cycle. A deposit or a withdrawal is a request, processed between cycles. return_pct is history after fees, null until enough cycles have finished.",
    vaults: rows,
  };
}

export async function getVault(session: ActaSession, input: { vault: string }) {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(input.vault)) throw new AgentError("invalid_vault", "vault is the vault's address (base58), as acta_list_vaults gives it.");
  const raw = await session.http.vault(input.vault).catch(() => null);
  if (!raw) throw new AgentError("unknown_vault", "No open vault has that address.", "fix_request");
  const vault = vaultView(raw);
  const token = await symbolOf(session, vault.main_mint);
  const [cycles, exposure, tokens] = await Promise.all([
    session.http.vaultCycles(input.vault, { limit: 8 }).catch(() => null),
    session.http.vaultExposure(input.vault).then(exposureView, () => null),
    session.http.tokens().catch(() => null),
  ]);
  const nowSec = session.nowSec();
  const depositBlock = flows.requestDepositBlock(vault, nowSec);
  const withdrawBlock = flows.requestWithdrawBlock(vault, nowSec);
  const cap = depositCap(vault.capacity);
  return {
    network: session.config.network,
    ...summary(vault, token, nowSec),
    deposits: depositBlock === null ? "open" : depositBlockMessage(depositBlock, vault),
    withdrawal_requests: withdrawBlock === null ? "open" : withdrawBlockMessage(withdrawBlock, vault),
    room_left: cap ? { amount: Number(cap.remaining) / 10 ** vault.main_decimals, token } : "no cap",
    fees_bps: { performance: vault.performance_fee_bps, management: vault.management_fee_bps },
    pending: { deposits: vault.pending_deposit_count, withdrawals: vault.pending_withdraw_count },
    withdrawals: `A deposit or a withdrawal is a request, processed at the end of the cycle; after ${Math.round(vault.capital_fallback_delay_seconds / 3600)} hours unprocessed, the depositor may process it.`,
    recent_cycles: cycles?.cycles.map((c) => ({
      expiry: isoTime(Number(c.expiry_ts)),
      state: c.state.type,
      return_pct: "return_pct" in c.state && c.state.return_pct.type === "available" ? c.state.return_pct.value : null,
    })) ?? null,
    // The options the vault holds right now: what its depositors are exposed to.
    holds: exposure?.positions.map((p) => ({
      option: p.position_type,
      role: p.role,
      asset: plainSymbol(tokens?.get(p.underlying_mint)?.symbol),
      strike: Number(p.strike) / PRICE_SCALE,
      size: p.underlying_decimals == null ? null : Number(p.quantity) / 10 ** p.underlying_decimals,
      expiry: isoTime(Number(p.expiry_ts)),
      in_the_money: p.itm,
    })) ?? null,
    page: `${session.config.siteUrl}/earn/${vault.vault_pda}`,
  };
}
