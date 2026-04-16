export type PortfolioPositionType = "call" | "csp";

export type PortfolioPosition = {
  id: string;
  asset: string;
  type: PortfolioPositionType;
  maturityTs: number; // unix seconds

  // Position sizing (kept generic; can map to on-chain later)
  size: number; // base amount (for CSP this can represent quote units received on settlement)
  notionalUsd: number;

  // Strategy terms
  apr: number; // percent, e.g. 28 = 28%
  currentPriceUsd: number;
  targetPriceUsd: number;

  // Yield received upfront at open
  upfrontYieldUsd: number;
  openedTs: number; // unix seconds

  // When closed/settled, add this (optional for now)
  closedTs?: number;
  outcome?: string;
};

export type PortfolioEarningsEvent = {
  t: number; // unix seconds
  deltaUsd: number; // +income, -loss
};

export type PortfolioApiResponse =
  | {
      ok: true;
      now: number;
      open: PortfolioPosition[];
      history: PortfolioPosition[];
      events: PortfolioEarningsEvent[];
    }
  | { ok: false; error: string };

export type PortfolioSummary = {
  weightedApr: number; // percent
  nextMaturityTs: number | null;
  totalIncomeUsd: number;
  incomeLast30dUsd: number;
  totalNotionalUsd: number;
};

export function computeWeightedApr(open: PortfolioPosition[]) {
  const denom = open.reduce((s, p) => s + (Number.isFinite(p.notionalUsd) ? p.notionalUsd : 0), 0);
  if (denom <= 0) return 0;
  const num = open.reduce(
    (s, p) => s + (Number.isFinite(p.apr) ? p.apr * (p.notionalUsd || 0) : 0),
    0
  );
  return num / denom;
}

export function computeNextMaturityTs(open: PortfolioPosition[]) {
  const ts = open
    .map((p) => p.maturityTs)
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)[0];
  return ts ?? null;
}

export function computeIncome(events: PortfolioEarningsEvent[], now: number) {
  const total = events.reduce((s, e) => s + (Number.isFinite(e.deltaUsd) ? e.deltaUsd : 0), 0);
  const since = now - 30 * 24 * 60 * 60;
  const m30 = events
    .filter((e) => Number.isFinite(e.t) && e.t >= since && e.t <= now)
    .reduce((s, e) => s + (Number.isFinite(e.deltaUsd) ? e.deltaUsd : 0), 0);
  return { totalIncomeUsd: total, incomeLast30dUsd: m30 };
}

export function computePortfolioSummary({
  open,
  events,
  now
}: {
  open: PortfolioPosition[];
  events: PortfolioEarningsEvent[];
  now: number;
}): PortfolioSummary {
  const totalNotionalUsd = open.reduce((s, p) => s + (Number.isFinite(p.notionalUsd) ? p.notionalUsd : 0), 0);
  const weightedApr = computeWeightedApr(open);
  const nextMaturityTs = computeNextMaturityTs(open);
  const { totalIncomeUsd, incomeLast30dUsd } = computeIncome(events, now);
  return { weightedApr, nextMaturityTs, totalIncomeUsd, incomeLast30dUsd, totalNotionalUsd };
}

export function buildEarningsSeries(events: PortfolioEarningsEvent[]) {
  const ordered = [...events]
    .filter((e) => Number.isFinite(e.t) && Number.isFinite(e.deltaUsd))
    .sort((a, b) => a.t - b.t);
  const pts: Array<{ t: number; v: number }> = [];
  let acc = 0;
  for (const e of ordered) {
    acc += e.deltaUsd;
    pts.push({ t: e.t, v: acc });
  }
  return pts;
}



