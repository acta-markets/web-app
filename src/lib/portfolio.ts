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

export function portfolioMock(now = Math.floor(Date.now() / 1000)): Omit<
  Extract<PortfolioApiResponse, { ok: true }>,
  "ok"
> {
  // Mock data shaped to match the "Portfolio" reference layout:
  // - Big notional (portfolio value)
  // - Many stepped earnings points across ~30 days
  const maturity = now + (15 * 60 * 60 + 44 * 60 + 51);
  const opened = now - 28 * 24 * 60 * 60;

  const open: PortfolioPosition[] = [
    {
      id: "pos_sol_call_1",
      asset: "SOL",
      type: "call",
      maturityTs: now + 45 * 24 * 60 * 60,
      size: 10_040.46,
      notionalUsd: 740_000,
      apr: 12.3,
      currentPriceUsd: 238.4,
      targetPriceUsd: 260,
      upfrontYieldUsd: 5200,
      openedTs: now - 16 * 24 * 60 * 60,
      outcome: "Sold 10,040.46 SOL"
    },
    {
      id: "pos_eth_csp_1",
      asset: "ETH",
      type: "csp",
      maturityTs: now + 30 * 24 * 60 * 60,
      size: 320,
      notionalUsd: 301_860,
      apr: 10.6,
      currentPriceUsd: 3925.12,
      targetPriceUsd: 3600,
      upfrontYieldUsd: 3600,
      openedTs: now - 12 * 24 * 60 * 60,
      outcome: "Get 301,860.00 USDC"
    },
    {
      id: "pos_zbtc_call_1",
      asset: "zBTC",
      type: "call",
      maturityTs: now + 55 * 24 * 60 * 60,
      size: 7.2,
      notionalUsd: 200_000,
      apr: 12.0,
      currentPriceUsd: 98_000,
      targetPriceUsd: 105_000,
      upfrontYieldUsd: 2500,
      openedTs: now - 10 * 24 * 60 * 60,
      outcome: "Sold 7.20 zBTC"
    }
  ];

  const history: PortfolioPosition[] = [
    {
      id: "hist_jlp_call_1",
      asset: "JLP",
      type: "call",
      maturityTs: now - 9 * 24 * 60 * 60,
      size: 620_000,
      notionalUsd: 960_000,
      apr: 11.0,
      currentPriceUsd: 1.54,
      targetPriceUsd: 1.7,
      upfrontYieldUsd: 1900,
      openedTs: now - 40 * 24 * 60 * 60,
      closedTs: now - 9 * 24 * 60 * 60,
      outcome: "Sold 620,000.00 JLP"
    }
  ];

  // Build a stepped 30-day earnings curve ending at $16,784.42 (like the reference).
  const stepDays = [0, 2, 5, 7, 10, 12, 15, 18, 21, 24, 26, 28];
  const stepDeltas = [1200, 950, 1300, 1100, 900, 1400, 1250, 1500, 1600, 1350, 1450, 2784.42];
  const events: PortfolioEarningsEvent[] = stepDays.map((d, i) => ({
    t: opened + d * 24 * 60 * 60,
    deltaUsd: stepDeltas[i]!
  }));

  return { now, open, history, events };
}


