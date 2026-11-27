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
import { liveShareSupply } from "./view";

export type AprSource = { label: "Staking" | "Premium"; pct: number };

export type AprView = {
  value: string;
  /** The figure behind `value`, in percent; null when there is none to show ("New", not covered). */
  pct: number | null;
  muted: boolean;
  /** the parts the headline adds up, when there are figures to show */
  sources: AprSource[];
  note: string;
  /** true when the headline is the lineup's assumption, not anything measured: it reads "APY", with a tilde */
  assumed?: true;
};

const PREMIUM_NOTE = "Premium is what the vault earns selling options, after fees. Projected APY annualizes the last 30 days; it is not a promise.";
const PROJECTED_MIN_DAYS = 20;

/** The backend's APY compounding, over the history the vault has so far. */
function projectedApy(returnPct: number, days: number): number {
  return 100 * ((1 + returnPct / 100) ** (365 / days) - 1);
}
const STAKING_NOTE = "Staking is the deposit asset's own yield, which the vault's share price does not include.";

/** Said under the (i) beside an assumed rate, so it is never taken for a live one. */
export const ASSUMED_APR_NOTE = "An estimate from backtesting. It is not this vault's live result and not a promise.";

/** The lineup's assumed rate as the headline, in its parts, until the vault has a figure of its own. */
export function assumedAprView(apr: { staking: number; premium: number }): AprView {
  const sources: AprSource[] = [
    ...(apr.staking > 0 ? [{ label: "Staking" as const, pct: apr.staking }] : []),
    ...(apr.premium > 0 ? [{ label: "Premium" as const, pct: apr.premium }] : []),
  ];
  return { value: `~${apr.staking + apr.premium}%`, pct: apr.staking + apr.premium, muted: false, sources, note: ASSUMED_APR_NOTE, assumed: true };
}

/**
 * The one projected APY every surface shows: the backend's 30-day figure plus any
 * staking yield of the deposit asset. Under 30 days it annualizes the history so
 * far, and reads "New" under 20 days. Where there is no figure at all, a lineup's
 * assumed rate stands in, marked as an assumption (`assumedAprView`); a vault with
 * no assumption and no history the backend can cover reads as empty.
 */
export function vaultApr(performance: VaultPerformance | null, stakingAprPct = 0, assumed?: { staking: number; premium: number }): AprView {
  const staking: AprSource[] = stakingAprPct > 0 ? [{ label: "Staking", pct: stakingAprPct }] : [];
  const premium = performance?.apy_30d ?? null;
  if (premium !== null) {
    return {
      value: formatPercent(stakingAprPct + premium),
      pct: stakingAprPct + premium,
      muted: false,
      sources: [...staking, { label: "Premium", pct: premium }],
      note: staking.length ? `${STAKING_NOTE} ${PREMIUM_NOTE}` : PREMIUM_NOTE,
    };
  }
  const all = performance?.returns.all ?? null;
  const young =
    performance?.covered === true && (all === null || Number(performance.computed_at) - Number(all.window_start_at) < APY_WINDOW_SECS);
  if (!young) return assumed ? assumedAprView(assumed) : { value: NONE, pct: null, muted: true, sources: [], note: "Not available." };
  const days = all === null ? 0 : (Number(all.window_end_at) - Number(all.window_start_at)) / 86_400;
  if (all === null || days < PROJECTED_MIN_DAYS) {
    // no completed cycle at all: the assumption stands in; a short but real history still reads New
    if (all === null && assumed) return assumedAprView(assumed);
    return { value: "New", pct: null, muted: true, sources: staking, note: "Projected APY shows after 20 days of history." };
  }
  const projected = projectedApy(all.return_pct, days);
  return {
    value: formatPercent(stakingAprPct + projected),
    pct: stakingAprPct + projected,
    muted: true,
    sources: [...staking, { label: "Premium", pct: projected }],
    note: `Annualized from ${Math.floor(days)} days of history, not yet 30. A short history can swing a lot.`,
  };
}

/** Return of the current capital generation, net of fees. */
export function vaultReturn(performance: VaultPerformance | null): { value: string; since: number | null } {
  const all = performance?.returns.all ?? null;
  if (all === null) return { value: NONE, since: null };
  return { value: formatPercent(all.return_pct, { signed: true }), since: Number(all.window_start_at) };
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
  if (staging.type === "none") return null;
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
  return { lower, upper: position.product.type === "spread" ? BigInt(position.product.upper_strike) : lower };
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
  const byPda = new Map(positions.map((position) => [position.position_pda, position]));
  return exposure.positions.map((p) => {
    const position = byPda.get(p.position_pda) ?? null;
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
      : position?.product.type === "spread"
        ? `${formatStrike(BigInt(position.strike))} / ${formatStrike(BigInt(position.product.upper_strike))}`
        : formatStrike(BigInt(p.strike));
    return {
      position: p.position_pda,
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
      ? { label: "Accepting deposits", tone: "open", detail: `Cycle ends ${formatDate(Number(vault.active_expiry_ts))}` }
      : { label: "Accepting deposits", tone: "open" };
  }
  if (block === "cutoff" || vault.phase === "settling") return { label: "Settling", tone: "neutral" };
  if (vault.phase === "processing_capital" || vault.equity_computed) {
    return { label: "Processing requests", tone: "neutral" };
  }
  return { label: "Deposits closed", tone: "neutral", detail: "Opens when the next cycle starts" };
}

export type VaultModalTab = "deposit" | "withdraw";

/**
 * The card's button. A vault that takes no deposits right now still says Deposit between
 * cycles and while settling: the form then says when they open again, and a visitor with
 * nothing in the vault has nothing to manage. Only a vault that is winding down or paused,
 * where a holder has something to do, opens on Withdraw.
 */
export function primaryVaultAction(vault: Vault, nowSecs: number): { label: "Deposit" | "Manage"; tab: VaultModalTab } {
  if (flows.requestDepositBlock(vault, nowSecs) === null) return { label: "Deposit", tab: "deposit" };
  return isWindingDown(vault) || vault.safety === "frozen" ? { label: "Manage", tab: "withdraw" } : { label: "Deposit", tab: "deposit" };
}

// What a depositor may do and why not: the contract's rules in words. Kept in a module of its own,
// free of the app's token tables, so the headless agent reads the same rules.
export * from "./rules";
