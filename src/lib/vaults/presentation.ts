import { flows } from "@acta-markets/ts-sdk/chain";
import type { DepositorPerformance } from "@acta-markets/ts-sdk/http";
import { getReferenceToken, getToken, getTokenSymbolByMint, tokenDisplayName } from "@/lib/tokens";
import { formatBps, formatDate, formatPercent, formatTokenAmount, formatUsd, NONE, shortAddress } from "./format";
import type {
  Vault,
  VaultExposure,
  VaultExposurePosition,
  VaultPerformance,
  VaultPhase,
  VaultPosition,
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

const PREMIUM_NOTE = "Premium is what the vault earns selling options, after fees. Projected APY annualizes the last 30 days; it is not a promise.";
const PROJECTED_MIN_DAYS = 20;

/** The backend's APY compounding, over the history the vault has so far. */
function projectedApy(returnPct: number, days: number): number {
  return 100 * ((1 + returnPct / 100) ** (365 / days) - 1);
}
const STAKING_NOTE = "Staking is the deposit asset's own yield, which the vault's share price does not include.";

/**
 * The one projected APY every surface shows: the backend's 30-day figure plus any
 * staking yield of the deposit asset. Under 30 days it annualizes the history so
 * far, and reads "New" under 20 days. A vault whose history the backend cannot
 * cover reads as empty.
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
  const days = all === null ? 0 : (Number(all.to_time) - Number(all.from_time)) / 86_400;
  if (all === null || days < PROJECTED_MIN_DAYS) {
    return { value: "New", muted: true, sources: staking, note: "Projected APY shows after 20 days of history." };
  }
  const projected = projectedApy(all.return_pct, days);
  return {
    value: formatPercent(stakingAprPct + projected),
    muted: true,
    sources: [...staking, { label: "Premium", pct: projected }],
    note: `Annualized from ${Math.floor(days)} days of history, not yet 30. A short history can swing a lot.`,
  };
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
  { value: "apy", label: "Projected APY", compare: compareVaultsByYield },
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
  if (mint === vault.main_mint) return { symbol: symbol ?? tokenDisplayName(mint), decimals: vault.main_decimals };
  if (mint === vault.second_mint) return { symbol: symbol ?? tokenDisplayName(mint), decimals: vault.second_decimals };
  const token = symbol ? getToken(symbol) : undefined;
  if (symbol && token) return { symbol, decimals: token.decimals };
  return getReferenceToken(mint) ?? null;
}

/** "1,250 USDC from SOL": an open staging slot, part of a leg parked in another mint mid-swap. */
export function stagingText(vault: Vault): string | null {
  const staging = vault.staging;
  if (!staging) return null;
  const leg = mintUnits(vault, staging.from_leg === "main" ? vault.main_mint : vault.second_mint);
  const units = mintUnits(vault, staging.mint);
  const held = units
    ? `${formatTokenAmount(BigInt(staging.amount), units.decimals, { compact: true })} ${units.symbol}`
    : shortAddress(staging.mint);
  return leg ? `${held} from ${leg.symbol}` : held;
}

/** "2,842 USDC", plus what holder legs paid when the backend could price it. */
export function formatPremium(flow: VaultPremiumFlow, units: { symbol: string; decimals: number }): string {
  const received = `${formatTokenAmount(BigInt(flow.received), units.decimals, { compact: true })} ${units.symbol}`;
  if (flow.paid === null || BigInt(flow.paid) === 0n) return received;
  return `${received} · paid ${formatTokenAmount(BigInt(flow.paid), units.decimals, { compact: true })}`;
}

export type ExposureRow = {
  position: string;
  type: "Call" | "Put" | "Call spread" | "Put spread";
  role: "Sold" | "Bought";
  strike: string;
  size: string;
  distance: string;
  itm: boolean | null;
  pnl: string;
  /** quote atoms if the position expired at spot, null until spot and premium are known */
  pnlAtoms: bigint | null;
  quoteMint: string;
  quoteDecimals: number | null;
  sort: { strike: number; size: number; distance: number | null; pnl: number | null };
};

const STRIKE_DECIMALS = 9;
export const EXPOSURE_TYPE = {
  covered_call: "Call",
  cash_secured_put: "Put",
  call_spread: "Call spread",
  put_spread: "Put spread",
  // a cash put is a put spread with a zero lower strike
  cash_put: "Put spread",
} as const;
const APY_WINDOW_SECS = 30 * 86_400;

const positive = (value: bigint) => (value > 0n ? value : 0n);

function formatStrike(atoms: bigint) {
  return formatTokenAmount(atoms, STRIKE_DECIMALS, {
    maxFractionDigits: atoms < 10n ** BigInt(STRIKE_DECIMALS) ? STRIKE_DECIMALS : 2,
  });
}

/** Leg bounds: spreads pay between the two strikes, `lower` starts paying a call spread and `upper` a put spread. */
function legBounds(position: VaultPosition) {
  const lower = BigInt(position.strike);
  return { lower, upper: position.product.kind === "spread" ? BigInt(position.product.upper_strike) : lower };
}

/** Strike at which the leg starts paying, in strike units. */
function triggerStrike(position: VaultPosition) {
  const { lower, upper } = legBounds(position);
  return position.position_type === "put_spread" ? upper : lower;
}

/** Payoff per underlying unit at `spot`, matching the contract's settlement. */
function payoffPerUnit(position: VaultPosition, spot: bigint) {
  const { lower, upper } = legBounds(position);
  const width = upper - lower;
  switch (position.position_type) {
    case "covered_call":
      return positive(spot - lower);
    case "cash_secured_put":
    case "cash_put":
      return positive(lower - spot);
    case "call_spread":
      return positive(spot - lower) < width ? positive(spot - lower) : width;
    case "put_spread":
      return positive(upper - spot) < width ? positive(upper - spot) : width;
  }
}

/** Premium plus payoff at `spot` in quote atoms: writers keep the premium and owe the payoff, holders the reverse. */
function pnlAtSpot(leg: VaultExposurePosition, position: VaultPosition, spot: bigint): bigint | null {
  if (leg.underlying_decimals === null || leg.quote_decimals === null) return null;
  const scale = 10n ** BigInt(STRIKE_DECIMALS + leg.underlying_decimals);
  const payoff = (payoffPerUnit(position, spot) * BigInt(leg.quantity) * 10n ** BigInt(leg.quote_decimals)) / scale;
  const premium = BigInt(position.net_premium);
  return position.role === "writer" ? premium - payoff : payoff - premium;
}

function formatSigned(amount: bigint, decimals: number) {
  return `${amount > 0n ? "+" : ""}${formatTokenAmount(amount, decimals, { maxFractionDigits: 4 })}`;
}

/** `positions` adds what `/exposure` lacks for cash products: the second strike and the premium. */
export function exposureRows(exposure: VaultExposure, positions: readonly VaultPosition[] = []): ExposureRow[] {
  const byPda = new Map(positions.map((position) => [position.position, position]));
  return exposure.positions.map((p) => {
    const position = byPda.get(p.position) ?? null;
    const spot = p.spot === null ? null : BigInt(p.spot);
    const trigger = position ? triggerStrike(position) : BigInt(p.strike);
    const isCall = p.position_type === "covered_call" || p.position_type === "call_spread";
    const computedDistance = spot === null || spot === 0n || !position
      ? null
      : (100 * Number(isCall ? trigger - spot : spot - trigger)) / Number(spot);
    const distancePct = p.distance_pct ?? computedDistance;
    const itm = p.itm ?? (computedDistance === null ? null : computedDistance < 0);
    const pnlAtoms = spot === null || !position ? null : pnlAtSpot(p, position, spot);
    const strike = p.position_type === "cash_put"
      ? `0 / ${formatStrike(BigInt(p.strike))}`
      : position?.product.kind === "spread"
        ? `${formatStrike(BigInt(position.strike))} / ${formatStrike(BigInt(position.product.upper_strike))}`
        : formatStrike(BigInt(p.strike));
    return {
      position: p.position,
      type: EXPOSURE_TYPE[p.position_type],
      role: p.role === "writer" ? "Sold" : "Bought",
      strike,
      size: p.underlying_decimals === null
        ? NONE
        : `${formatTokenAmount(BigInt(p.quantity), p.underlying_decimals)} ${tokenDisplayName(p.underlying_mint)}`,
      distance: distancePct === null ? NONE : `${formatPercent(Math.abs(distancePct), { digits: 1 })} ${itm ? "ITM" : "OTM"}`,
      itm,
      pnl: pnlAtoms === null || p.quote_decimals === null
        ? NONE
        : `${formatSigned(pnlAtoms, p.quote_decimals)} ${tokenDisplayName(p.quote_mint)}`,
      pnlAtoms,
      quoteMint: p.quote_mint,
      quoteDecimals: p.quote_decimals,
      sort: {
        strike: Number(trigger),
        size: Number(p.quantity),
        distance: distancePct === null ? null : itm ? -Math.abs(distancePct) : Math.abs(distancePct),
        pnl: pnlAtoms === null ? null : Number(pnlAtoms),
      },
    };
  });
}

/** Current price per underlying, from the same response as the rows. */
export function exposureSpots(exposure: VaultExposure): { symbol: string; price: string }[] {
  const spots = new Map<string, string>();
  for (const p of exposure.positions) {
    if (p.spot !== null && !spots.has(p.underlying_mint)) spots.set(p.underlying_mint, p.spot);
  }
  return [...spots].map(([mint, spot]) => ({
    symbol: tokenDisplayName(mint),
    price: `$${formatTokenAmount(BigInt(spot), STRIKE_DECIMALS, { maxFractionDigits: 2 })}`,
  }));
}

/** Net P&L at spot per quote mint; a mint drops out while any of its rows is unpriced. */
export function exposurePnlTotals(rows: readonly ExposureRow[]): { quoteMint: string; value: string }[] {
  const totals = new Map<string, { atoms: bigint | null; decimals: number | null }>();
  for (const row of rows) {
    const total = totals.get(row.quoteMint) ?? { atoms: 0n, decimals: row.quoteDecimals };
    total.atoms = total.atoms === null || row.pnlAtoms === null ? null : total.atoms + row.pnlAtoms;
    totals.set(row.quoteMint, total);
  }
  return [...totals].flatMap(([quoteMint, { atoms, decimals }]) => (atoms === null || decimals === null
    ? []
    : [{ quoteMint, value: `${formatSigned(atoms, decimals)} ${tokenDisplayName(quoteMint)}` }]));
}

export type ManagerScope = { allowed: string[]; blocked: string[] };

const CAN_SELL_OPTIONS = 1;
const CAN_BUY_OPTIONS = 2;
const CAN_USE_SECOND_MINT_STRATEGY = 4;

/** What the vault's capabilities and policy let its manager do, in depositor terms. */
export function managerScope(
  vault: Pick<Vault, "capabilities" | "policy" | "manager_stake_min_bps">,
  symbol: string,
  secondSymbol: string,
): ManagerScope {
  const can = (bit: number) => (vault.capabilities & bit) !== 0;
  const { max_rebalance_drift_bps, min_main_liquidity_bps } = vault.policy;
  const [sell, buy] = [can(CAN_SELL_OPTIONS), can(CAN_BUY_OPTIONS)];
  const options = sell && buy ? "Sell and buy options." : sell ? "Sell options." : buy ? "Buy options." : null;
  return {
    allowed: [
      ...(options ? [options] : []),
      ...(can(CAN_USE_SECOND_MINT_STRATEGY) ? [`Trade with ${secondSymbol} as well as ${symbol}.`] : []),
      `Swap ${symbol} and ${secondSymbol} through approved venues, up to ${formatBps(max_rebalance_drift_bps)} off the oracle price.`,
    ],
    blocked: [
      "Take funds out of the vault.",
      "Trade with pending deposits.",
      "Mix expiries within a cycle.",
      "Change fees, the deposit cap or limits without a timelock.",
      `Open positions with under ${formatBps(vault.manager_stake_min_bps)} of their own money in the vault.`,
      ...(!sell ? ["Sell options."] : []),
      ...(!buy ? ["Buy options."] : []),
      ...(!can(CAN_USE_SECOND_MINT_STRATEGY) ? [`Trade with ${secondSymbol}.`] : []),
      ...(min_main_liquidity_bps > 0 ? [`Leave under ${formatBps(min_main_liquidity_bps)} of the vault in ${symbol} at the end of a cycle.`] : []),
    ],
  };
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
  "This requests every remaining share. The final withdrawal pays out both vault assets and may need to wait for pending deposits to be processed.";

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
  const finalRequest = vault.pending_withdraw_count === 1 && isLastSharesWithdrawal(vault, BigInt(vault.pending_withdraw_shares));
  const pricedVault = vault.phase === "idle" && !vault.equity_computed ? { ...vault, equity_computed: true } : vault;
  if (finalRequest && flows.processFinalWithdrawalBlock(pricedVault)) return { kind: "hidden" };
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

/** The contract reads the live mint supply for the final withdrawal. */
export function isLastSharesWithdrawal(vault: Pick<Vault, "live_share_supply" | "total_shares">, shares: bigint): boolean {
  if (shares <= 0n) return false;
  return shares >= BigInt(vault.live_share_supply ?? vault.total_shares);
}

/** The binding deposit cap, or null when deposits are uncapped (a u64::MAX cap counts as none). */
export function depositCap(capacity: Vault["capacity"]): { cap: bigint; remaining: bigint } | null {
  if (capacity.type === "unlimited" || BigInt(capacity.cap_limit) === 18_446_744_073_709_551_615n) return null;
  return { cap: BigInt(capacity.cap_limit), remaining: BigInt(capacity.remaining) };
}
