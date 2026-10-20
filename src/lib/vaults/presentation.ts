import { flows } from "@acta-markets/ts-sdk/chain";
import type { DepositorPerformance } from "@acta-markets/ts-sdk/http";
import { getToken, getTokenSymbolByMint } from "@/lib/tokens";
import { formatDate, formatPercent, formatTokenAmount, formatUsd, NONE, shortAddress } from "./format";
import type {
  Vault,
  VaultExposure,
  VaultPerformance,
  VaultPhase,
  VaultPremiumFlow,
  VaultSafety,
} from "./types";

export type AprSource = { label: "Staking" | "Premium"; pct: number };

export type AprView = {
  value: string;
  muted: boolean;
  /** the parts the headline adds up, when there are figures to show */
  sources: AprSource[];
  note: string;
};

const PREMIUM_NOTE = "Premium is what the vault earns selling options, after fees.";
const STAKING_NOTE = "Staking is the deposit asset's own yield, which the vault's share price does not include.";

/**
 * The one APY every surface shows: the backend's 30-day APY plus any staking
 * yield of the deposit asset. A vault without 30 days of history reads "New";
 * one whose history the backend cannot cover reads as empty.
 */
export function vaultApr(performance: VaultPerformance | null, stakingAprPct = 0): AprView {
  const staking: AprSource[] = stakingAprPct > 0 ? [{ label: "Staking", pct: stakingAprPct }] : [];
  const premium = performance?.apy_30d ?? null;
  if (premium !== null) {
    return {
      value: formatPercent(stakingAprPct + premium),
      muted: false,
      sources: [...staking, { label: "Premium", pct: premium }],
      note: staking.length ? `${STAKING_NOTE} ${PREMIUM_NOTE}` : PREMIUM_NOTE,
    };
  }
  const all = performance?.returns.all ?? null;
  const young =
    performance?.covered === true && (all === null || Number(performance.computed_at) - Number(all.from_time) < APY_WINDOW_SECS);
  if (!young) return { value: NONE, muted: true, sources: [], note: "Not available." };
  return { value: "New", muted: true, sources: staking, note: "Premium shows after 30 days of history." };
}

/** Return of the current capital generation, net of fees. */
export function vaultReturn(performance: VaultPerformance | null): { value: string; since: number | null } {
  const all = performance?.returns.all ?? null;
  if (all === null) return { value: NONE, since: null };
  return { value: formatPercent(all.return_pct, { signed: true }), since: Number(all.from_time) };
}

const WIND_DOWN: ReadonlySet<VaultSafety> = new Set<VaultSafety>(["closing", "withdraw_only", "emergency_unwind"]);

export function isWindingDown(vault: Pick<Vault, "safety">): boolean {
  return WIND_DOWN.has(vault.safety);
}

/** What the grid sorts on: the vault, its display name and staking yield. */
export type VaultSortEntry = {
  vault: Vault;
  meta: { name: string; stakingAprPct: number };
};

export type VaultSort = "apy" | "tvl" | "name";

function byName(a: VaultSortEntry, b: VaultSortEntry): number {
  return a.meta.name.localeCompare(b.meta.name, "en", { sensitivity: "base", numeric: true });
}

// 0: a 30-day APY, 1: a shorter track record, 2: nothing to rank on
function yieldRank({ vault }: VaultSortEntry): [number, number] {
  const performance = vault.performance;
  if (performance?.apy_30d != null) return [0, performance.apy_30d];
  if (performance?.returns.all != null) return [1, performance.returns.all.return_pct];
  return [2, 0];
}

/**
 * Highest proven yield first: 30-day APY (staking included, so the order
 * matches the cards), then younger vaults by return so far, then the rest.
 * Vaults winding down go last whatever their history.
 */
export function compareVaultsByYield(a: VaultSortEntry, b: VaultSortEntry): number {
  const windDown = Number(isWindingDown(a.vault)) - Number(isWindingDown(b.vault));
  if (windDown !== 0) return windDown;
  const [rankA, yieldA] = yieldRank(a);
  const [rankB, yieldB] = yieldRank(b);
  if (rankA !== rankB) return rankA - rankB;
  const staking = rankA === 0 ? b.meta.stakingAprPct - a.meta.stakingAprPct : 0;
  return yieldB - yieldA + staking || byName(a, b);
}

/** Largest dollar TVL first. Vaults without a USD value cannot be compared, so they follow by name. */
export function compareVaultsByTvl(a: VaultSortEntry, b: VaultSortEntry): number {
  const usdA = vaultTvlUsd(a.vault);
  const usdB = vaultTvlUsd(b.vault);
  if (usdA === null || usdB === null) return Number(usdA === null) - Number(usdB === null) || byName(a, b);
  return usdB - usdA || byName(a, b);
}

type VaultCompare = (a: VaultSortEntry, b: VaultSortEntry) => number;

export const VAULT_SORTS: readonly { value: VaultSort; label: string; compare: VaultCompare }[] = [
  { value: "apy", label: "APY", compare: compareVaultsByYield },
  { value: "tvl", label: "TVL", compare: compareVaultsByTvl },
  { value: "name", label: "Name", compare: byName },
];

/** The backend's indicative dollar TVL, or null without a fresh price. */
export function vaultTvlUsd(vault: Pick<Vault, "tvl_usd_1e9">): number | null {
  return vault.tvl_usd_1e9 === null ? null : Number(vault.tvl_usd_1e9) / 1e9;
}

const PHASE_LABEL: Record<VaultPhase, string> = {
  idle: "Between cycles",
  active: "Trading",
  settling: "Settling",
  processing_capital: "Processing requests",
};

const SAFETY_LABEL: Partial<Record<VaultSafety, string>> = {
  frozen: "Paused",
  closing: "Closing",
  withdraw_only: "Withdraw only",
  emergency_unwind: "Unwinding",
};

export function cyclePhaseLabel(vault: Pick<Vault, "phase" | "safety">): string {
  return SAFETY_LABEL[vault.safety] ?? PHASE_LABEL[vault.phase];
}

/** Symbol and decimals of a vault leg or a known token; null when neither knows the mint. */
export function mintUnits(vault: Pick<Vault, "main_mint" | "main_decimals" | "second_mint" | "second_decimals">, mint: string) {
  const symbol = getTokenSymbolByMint(mint);
  if (mint === vault.main_mint) return { symbol: symbol ?? shortAddress(mint), decimals: vault.main_decimals };
  if (mint === vault.second_mint) return { symbol: symbol ?? shortAddress(mint), decimals: vault.second_decimals };
  const token = symbol ? getToken(symbol) : undefined;
  return symbol && token ? { symbol, decimals: token.decimals } : null;
}

/** "2,842 USDC", plus what holder legs paid when the backend could price it. */
export function formatPremium(flow: VaultPremiumFlow, units: { symbol: string; decimals: number }): string {
  const received = `${formatTokenAmount(BigInt(flow.received), units.decimals, { compact: true })} ${units.symbol}`;
  if (flow.paid === null || BigInt(flow.paid) === 0n) return received;
  return `${received} · paid ${formatTokenAmount(BigInt(flow.paid), units.decimals, { compact: true })}`;
}

export type ExposureRow = {
  position: string;
  type: "Call" | "Put";
  role: "Sold" | "Bought";
  strike: string;
  distance: string;
  itm: boolean | null;
};

const STRIKE_DECIMALS = 9;
const APY_WINDOW_SECS = 30 * 86_400;

export function exposureRows(exposure: VaultExposure): ExposureRow[] {
  return exposure.positions.map((p) => ({
    position: p.position,
    type: p.position_type === "covered_call" ? "Call" : "Put",
    role: p.role === "writer" ? "Sold" : "Bought",
    strike: formatTokenAmount(BigInt(p.strike), STRIKE_DECIMALS, {
      maxFractionDigits: BigInt(p.strike) < 10n ** BigInt(STRIKE_DECIMALS) ? STRIKE_DECIMALS : 2,
    }),
    distance:
      p.distance_pct === null ? NONE : `${formatPercent(Math.abs(p.distance_pct), { digits: 1 })} ${p.itm ? "ITM" : "OTM"}`,
    itm: p.itm,
  }));
}

/** Net intrinsic value at spot per quote mint; a mint drops out while any of its legs lacks a spot. */
export function exposureTotals(exposure: VaultExposure): { quoteMint: string; value: string }[] {
  return exposure.totals.flatMap((total) => {
    const decimals = exposure.positions.find((p) => p.quote_mint === total.quote_mint)?.quote_decimals ?? null;
    if (total.outstanding_intrinsic === null || decimals === null) return [];
    const symbol = getTokenSymbolByMint(total.quote_mint) ?? shortAddress(total.quote_mint);
    const amount = BigInt(total.outstanding_intrinsic);
    const sign = amount > 0n ? "+" : "";
    return [{ quoteMint: total.quote_mint, value: `${sign}${formatTokenAmount(amount, decimals, { compact: true })} ${symbol}` }];
  });
}

/** Return since entry weighted by lot shares; null unless priced lots hold exactly `shares`. */
export function entryReturnPct(performance: DepositorPerformance, shares: bigint): number | null {
  let priced = 0n;
  let weighted = 0;
  for (const lot of performance.lots) {
    if (lot.returnSinceEntryPct === null) return null;
    priced += lot.shares;
    weighted += Number(lot.shares) * lot.returnSinceEntryPct;
  }
  return priced > 0n && priced === shares ? weighted / Number(priced) : null;
}

/** Dollars when the backend has a fresh price, else the deposit asset. */
export function formatVaultTvl(vault: Pick<Vault, "equity" | "main_decimals" | "tvl_usd_1e9">, symbol: string): string {
  const usd = vaultTvlUsd(vault);
  return usd === null ? `${formatVaultEquity(vault)} ${symbol}` : formatUsd(usd);
}

/** Vault equity in the deposit asset, short enough for a tile: whole units from a thousand, two decimals from one. */
export function formatVaultEquity(vault: Pick<Vault, "equity" | "main_decimals">): string {
  const equity = BigInt(vault.equity);
  const unit = 10n ** BigInt(vault.main_decimals);
  const maxFractionDigits = equity >= 1000n * unit ? 0 : equity >= unit ? 2 : undefined;
  return formatTokenAmount(equity, vault.main_decimals, { compact: true, maxFractionDigits });
}

export type VaultStatusTone = "open" | "neutral" | "warning";
export type VaultStatusView = { label: string; tone: VaultStatusTone; detail?: string };

/** Deposit availability comes from the contract rules, never from `accepting_deposits` alone. */
export function vaultStatus(vault: Vault, nowSecs: number): VaultStatusView {
  switch (vault.safety) {
    case "frozen":
      return { label: "Paused", tone: "warning" };
    case "closing":
      return { label: "Closing", tone: "warning", detail: "Withdrawals only" };
    case "withdraw_only":
      return { label: "Withdraw only", tone: "warning" };
    case "emergency_unwind":
      return { label: "Unwinding", tone: "warning" };
  }
  const block = flows.requestDepositBlock(vault, nowSecs);
  if (block === null) {
    return vault.phase === "active"
      ? { label: "Accepting deposits", tone: "open", detail: `Cycle ends ${formatDate(Number(vault.active_expiry))}` }
      : { label: "Accepting deposits", tone: "open" };
  }
  if (block === "cutoff" || vault.phase === "settling") return { label: "Settling", tone: "neutral" };
  if (vault.phase === "processing_capital" || vault.equity_computed) {
    return { label: "Processing requests", tone: "neutral" };
  }
  return { label: "Deposits closed", tone: "neutral", detail: "Opens when the next cycle starts" };
}

export type VaultModalTab = "deposit" | "withdraw";

/** Vaults that will never take deposits again open straight on Withdraw. */
export function primaryVaultAction(vault: Vault, nowSecs: number): { label: "Deposit" | "Manage"; tab: VaultModalTab } {
  return flows.requestDepositBlock(vault, nowSecs) === "safety"
    ? { label: "Manage", tab: "withdraw" }
    : { label: "Deposit", tab: "deposit" };
}

type BlockContext = Pick<Vault, "safety" | "phase" | "equity_computed">;

function phaseMessage(phase: VaultPhase, subject: "Deposits" | "Withdrawal requests"): string {
  if (phase === "settling") return `The vault is settling this cycle. ${subject} open again after settlement.`;
  if (phase === "processing_capital") {
    return `The vault is processing this cycle's requests. ${subject} open again after that.`;
  }
  return `${subject} are not open right now.`;
}

export function depositBlockMessage(block: flows.VaultActionBlock, vault: BlockContext): string {
  switch (block) {
    case "safety":
      switch (vault.safety) {
        case "frozen":
          return "This vault is paused and is not taking deposits.";
        case "closing":
          return "This vault is closing. It only processes withdrawals now.";
        case "withdraw_only":
          return "This vault only processes withdrawals now.";
        case "emergency_unwind":
          return "This vault is unwinding its positions and is not taking deposits.";
        default:
          return "Deposits are not open right now.";
      }
    case "window_closed":
      return vault.equity_computed
        ? "This cycle's requests are being processed. Deposits open again after that."
        : "Deposits are closed until the next cycle starts.";
    case "phase":
      return phaseMessage(vault.phase, "Deposits");
    case "cutoff":
      return "This cycle has reached expiry. Deposits open again after settlement.";
    default:
      return "Deposits are not open right now.";
  }
}

export function withdrawBlockMessage(block: flows.VaultActionBlock, vault: BlockContext): string {
  switch (block) {
    case "safety":
      return "This vault is unwinding its positions. Withdrawals open once the unwind completes.";
    case "phase":
      return phaseMessage(vault.phase, "Withdrawal requests");
    case "cutoff":
      return "This cycle has reached expiry. Withdrawal requests open again after settlement.";
    case "priced":
      return "This cycle's requests are being processed. Withdrawal requests open again after that.";
    default:
      return "Withdrawal requests are not open right now.";
  }
}

export function cancelBlockMessage(block: flows.VaultActionBlock): string {
  switch (block) {
    case "safety":
      return "Cancelling is not available while the vault is in this mode.";
    case "phase":
    case "cutoff":
    case "priced":
      return "This request is locked in for processing and can no longer be cancelled.";
    default:
      return "This request cannot be cancelled right now.";
  }
}

export const REQUEST_EXISTS_COPY = {
  deposit: "You already have a pending deposit. Cancel it to change the amount.",
  withdraw: "You already have a pending withdrawal. Cancel it to change the amount.",
} as const;

export const LAST_SHARES_COPY =
  "This would redeem every remaining share in the vault. Final withdrawals are not available in the app yet.";

export type SelfProcessView =
  | { kind: "available"; label: string }
  | { kind: "waiting"; availableAt: number }
  | { kind: "hidden" };

/** When anyone, not just the manager, may process a request (the contract's fallback delay). */
function publicProcessingAt(vault: Vault, createdAt: bigint): number {
  const delay = Number(vault.capital_fallback_delay_secs);
  return vault.phase === "processing_capital" ? Number(vault.active_expiry) + delay : Number(createdAt) + delay;
}

export function depositSelfProcessView(vault: Vault, createdAt: bigint, nowSecs: number): SelfProcessView {
  const block = flows.selfProcessDepositBlock(vault, createdAt, nowSecs);
  if (block === null) {
    // outside normal mode, processing a deposit returns it instead of minting shares
    return { kind: "available", label: vault.safety === "normal" ? "Process my deposit" : "Refund my deposit" };
  }
  if (block === "authority") return { kind: "waiting", availableAt: publicProcessingAt(vault, createdAt) };
  // a deposit alone cannot force a valuation, so there is nothing to offer but cancel
  return { kind: "hidden" };
}

export function withdrawSelfProcessView(vault: Vault, createdAt: bigint, nowSecs: number): SelfProcessView {
  const block = flows.selfProcessWithdrawBlock(vault, createdAt, nowSecs);
  if (block === null) return { kind: "available", label: "Process my withdrawal" };
  if (block === "authority") return { kind: "waiting", availableAt: publicProcessingAt(vault, createdAt) };
  if (block === "unpriced") {
    // an aged withdrawal may value idle capital itself, then withdraw, in one transaction
    const idle = flows.processIdleWithdrawalBlock(vault, createdAt, nowSecs);
    if (idle === null) return { kind: "available", label: "Process my withdrawal" };
    if (idle === "authority") {
      return { kind: "waiting", availableAt: Number(createdAt) + Number(vault.capital_fallback_delay_secs) };
    }
  }
  return { kind: "hidden" };
}

/** Redeeming the whole supply needs the final-withdrawal path, which the app does not build yet. */
export function isLastSharesWithdrawal(vault: Pick<Vault, "live_share_supply" | "total_shares">, shares: bigint): boolean {
  if (shares <= 0n) return false;
  return shares >= BigInt(vault.live_share_supply ?? vault.total_shares);
}
