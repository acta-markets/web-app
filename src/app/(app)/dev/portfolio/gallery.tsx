"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AppSegmented } from "@/components/app-ui/app-segmented";
import { IncomeCard } from "@/components/portfolio/income-card";
import { AssetFilter } from "@/components/portfolio/asset-filter";
import { ExerciseFilter } from "@/components/portfolio/exercise-filter";
import { FundingStrip } from "@/components/portfolio/funding-strip";
import { PerformanceStrip } from "@/components/portfolio/performance-strip";
import { PositionsTable } from "@/components/portfolio/positions-table";
import { LoadingStatus, PerformanceSkeleton, PortfolioEmpty, PortfolioSignIn, PositionsSkeleton } from "@/components/portfolio/portfolio-states";
import type { WalletPositionSummary } from "@/lib/portfolio-api";
import { openWrittenApr, summarizePnl, tradingStats } from "@/lib/portfolio-pnl";
import { buildPositionRows, fundingSummary, isWorthExercising } from "@/lib/portfolio-positions";
import type { PositionInfo } from "@/lib/rfq-client";
import { TOKENS, getNetwork } from "@/lib/tokens";

const DAY = 86_400;
const SPOT: Record<string, number> = {
  SOL: 148.2, BTC: 70_250, HYPE: 31.4,
  ETH: 3_420, TSLA: 412, XAU: 4_105, NVDA: 188, SPY: 702, QQQ: 631, JUP: 0.92, JTO: 2.85, PYTH: 0.41, RAY: 3.1, WIF: 1.74, ORCA: 2.2,
};
/** A bought put on each of these, so the funding summary has a long list of assets to show. */
const FUND_ASSETS = ["ETH", "TSLA", "XAU", "NVDA", "SPY", "QQQ", "JUP", "JTO", "PYTH", "RAY", "WIF", "ORCA"];

type Fixture = {
  id: string;
  symbol: string;
  decimals?: number;
  terms: Record<string, unknown>;
  side?: "buy" | "sell";
  quantity: number;
  /** Per-unit option price, in dollars. */
  price: number;
  /** Seconds from now to expiry; negative for a position that has already ended. */
  expiresIn: number;
  state?: string;
  settlement?: Record<string, unknown>;
};

function position(now: number, f: Fixture): PositionInfo {
  const decimals = f.decimals ?? 9;
  return {
    pda: f.id,
    market_pda: `market-${f.id}`,
    underlying_mint: `${f.symbol}-mint`,
    underlying_symbol: f.symbol,
    underlying_decimals: decimals,
    quote_mint: TOKENS.USDC.mint[getNetwork()],
    quote_symbol: "USDC",
    quote_decimals: 6,
    terms: f.terms,
    side: f.side ?? "sell",
    // amounts travel as decimal strings (SDK 0.8.0)
    quantity: String(Math.round(f.quantity * 10 ** decimals)),
    price: String(Math.round(f.price * 1e9)),
    total_premium: String(Math.round(f.price * f.quantity * 1e6)),
    created_at: now + f.expiresIn - 7 * DAY,
    expiry_ts: now + f.expiresIn,
    underlying_price: { type: "available", price: String(Math.round(SPOT[f.symbol] * 1e9)), published_at: now },
    state: f.state ?? "open",
    settlement: f.settlement,
  } as unknown as PositionInfo;
}

const OPEN: Fixture[] = [
  { id: "sol-cc", symbol: "SOL", terms: { type: "covered_call", strike: "160000000000" }, quantity: 12, price: 1.85, expiresIn: 3 * DAY + 7200 },
  { id: "sol-csp", symbol: "SOL", terms: { type: "cash_secured_put", strike: "150000000000" }, quantity: 8, price: 2.4, expiresIn: 5 * DAY },
  { id: "btc-call", symbol: "BTC", decimals: 8, terms: { type: "covered_call", strike: "69000000000000" }, side: "buy", quantity: 0.1, price: 521, expiresIn: 5 * 3600 },
  { id: "btc-put", symbol: "BTC", decimals: 8, terms: { type: "cash_secured_put", strike: "71000000000000" }, side: "buy", quantity: 0.05, price: 640, expiresIn: 9 * DAY },
  { id: "btc-funded", symbol: "BTC", decimals: 8, terms: { type: "covered_call", strike: "68000000000000" }, side: "buy", quantity: 0.02, price: 900, expiresIn: 2 * DAY, state: "funded" },
  { id: "sol-spread", symbol: "SOL", terms: { type: "put_spread", lower_strike: "130000000000", upper_strike: "145000000000" }, quantity: 20, price: 1.1, expiresIn: 6 * DAY },
  { id: "hype-settling", symbol: "HYPE", terms: { type: "covered_call", strike: "34000000000" }, quantity: 150, price: 0.42, expiresIn: -600, state: "terminal_pending" },
];

const CLOSED: Fixture[] = [
  { id: "c1", symbol: "SOL", terms: { type: "covered_call", strike: "155000000000" }, quantity: 10, price: 2.1, expiresIn: -2 * DAY, state: "settled", settlement: { type: "physical", settlement_price: "149000000000", is_otm: true } },
  { id: "c2", symbol: "SOL", terms: { type: "cash_secured_put", strike: "152000000000" }, quantity: 6, price: 2.6, expiresIn: -9 * DAY, state: "settled", settlement: { type: "physical", settlement_price: "146000000000", is_otm: false } },
  { id: "c3", symbol: "BTC", decimals: 8, terms: { type: "covered_call", strike: "66000000000000" }, side: "buy", quantity: 0.1, price: 480, expiresIn: -16 * DAY, state: "settled", settlement: { type: "physical", settlement_price: "69400000000000", is_otm: false } },
  { id: "c4", symbol: "BTC", decimals: 8, terms: { type: "cash_secured_put", strike: "64000000000000" }, side: "buy", quantity: 0.1, price: 350, expiresIn: -23 * DAY, state: "settled", settlement: { type: "not_exercised", settlement_price: "61000000000000" } },
  { id: "c5", symbol: "SOL", terms: { type: "put_spread", lower_strike: "120000000000", upper_strike: "140000000000" }, quantity: 15, price: 1.4, expiresIn: -30 * DAY, state: "settled", settlement: { type: "cash", settlement_price: "134000000000", holder_payoff: "90000000", writer_return: "210000000" } },
  { id: "c6", symbol: "HYPE", terms: { type: "covered_call", strike: "30000000000" }, quantity: 200, price: 0.5, expiresIn: -37 * DAY, state: "liquidated" },
];

/** Enough open rows across tokens for the table to group by underlying. */
const MANY: Fixture[] = [
  ...OPEN.filter((f) => f.state == null),
  { id: "m1", symbol: "HYPE", terms: { type: "covered_call", strike: "36000000000" }, quantity: 300, price: 0.38, expiresIn: 4 * DAY },
  { id: "m2", symbol: "HYPE", terms: { type: "cash_secured_put", strike: "29000000000" }, quantity: 120, price: 0.55, expiresIn: 11 * DAY },
  { id: "m3", symbol: "SOL", terms: { type: "covered_call", strike: "170000000000" }, quantity: 25, price: 0.9, expiresIn: 12 * DAY },
  { id: "m4", symbol: "BTC", decimals: 8, terms: { type: "cash_secured_put", strike: "67000000000000" }, quantity: 0.2, price: 410, expiresIn: 13 * DAY },
  ...FUND_ASSETS.map((symbol, i): Fixture => ({
    id: `fund-${symbol}`,
    symbol,
    // a put struck 5% above the price, so it is in the money and worth funding
    terms: { type: "cash_secured_put", strike: String(Math.round(SPOT[symbol] * 1.05 * 100) * 10_000_000) },
    side: "buy",
    quantity: Math.max(1, Math.round(900 / SPOT[symbol])),
    price: SPOT[symbol] * 0.02,
    expiresIn: (i + 2) * DAY,
  })),
];

function incomeSummary(now: number): WalletPositionSummary[] {
  const daily = Array.from({ length: 30 }, (_, i) => {
    const day = new Date((now - (29 - i) * DAY) * 1000).toISOString().slice(0, 10);
    // a week's premium lands on one day, as it does when positions are opened in batches
    return { day, premium: String(i % 7 === 2 ? (38 + i * 3) * 1_000_000 : i % 7 === 5 ? 12_500_000 : 0) };
  });
  const recent = daily.reduce((sum, d) => sum + BigInt(d.premium), 0n);
  return [{
    quote_mint: TOKENS.USDC.mint[getNetwork()],
    quote_decimals: 6,
    premium_all_time: String(recent + 1_184_000_000n),
    premium_30d: String(recent),
    open_positions: OPEN.length,
    daily,
  }];
}

const liveSpot = (p: PositionInfo) => SPOT[p.underlying_symbol] * 1e9;
const symbolFor = (p: PositionInfo) => p.underlying_symbol;

type Scene = "loaded" | "grouped" | "loading" | "empty" | "signed-out" | "failed" | "no-open";
const SCENES: Array<{ value: Scene; label: string }> = [
  { value: "loaded", label: "Loaded" },
  { value: "grouped", label: "Grouped" },
  { value: "loading", label: "Loading" },
  { value: "empty", label: "Never traded" },
  { value: "signed-out", label: "Signed out" },
  { value: "failed", label: "Failed" },
  { value: "no-open", label: "Nothing open" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">{title}</h2>
      {children}
    </section>
  );
}

/** The portfolio page's pieces from fixtures, composed the way `PortfolioClient` composes them. */
export function PortfolioGallery() {
  // `?scene=` picks the starting state, so each one can be opened (or screenshotted) directly.
  const [scene, setScene] = useState<Scene>("loaded");
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("scene");
    if (SCENES.some((s) => s.value === wanted)) setScene(wanted as Scene);
  }, []);
  const [now] = useState(() => Math.floor(Date.now() / 1000));
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [funded, setFunded] = useState<ReadonlySet<string>>(new Set());
  const [quoteMint, setQuoteMint] = useState("");
  const [assetFilter, setAssetFilter] = useState<string | null>(null);
  const [exerciseOnly, setExerciseOnly] = useState(false);

  const deposit = {
    pending,
    funded,
    deposit: ({ pda }: { pda: string }) => fund([pda]),
  };
  /** Stands in for the wallet: every deposit "confirms" after a moment. */
  function fund(pdas: string[]) {
    setPending(new Set(pdas));
    window.setTimeout(() => {
      setFunded((current) => new Set([...current, ...pdas]));
      setPending(new Set());
    }, 1200);
  }

  const data = useMemo(() => {
    const open = (scene === "grouped" ? MANY : scene === "no-open" ? [] : OPEN).map((f) => position(now, f));
    const closed = CLOSED.map((f) => position(now, f));
    const all = [...open, ...closed];
    const rows = buildPositionRows(all, symbolFor, now * 1000, liveSpot);
    return {
      openRows: rows.filter((r) => r.isOpen || r.state === "Settling"),
      closedRows: rows.filter((r) => !r.isOpen && r.state !== "Settling"),
      pnl: summarizePnl(all, liveSpot),
      apr: openWrittenApr(all),
      trading: tradingStats(all),
      summaries: incomeSummary(now),
    };
  }, [scene, now]);

  const nowMs = now * 1000;
  const funding = fundingSummary(data.openRows, nowMs, funded);
  const assetCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of data.openRows) counts.set(row.symbol, (counts.get(row.symbol) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]);
  }, [data.openRows]);
  const shownAsset = assetCounts.some(([symbol]) => symbol === assetFilter) ? assetFilter : null;
  const assetRows = shownAsset ? data.openRows.filter((r) => r.symbol === shownAsset) : data.openRows;
  const worthExercising = assetRows.filter((r) => isWorthExercising(r, nowMs));
  const exerciseOn = exerciseOnly && worthExercising.length > 0;
  const visibleOpenRows = exerciseOn ? worthExercising : assetRows;

  return (
    <div className="mx-auto w-full max-w-[850px] pb-16 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-8">
      <p className="font-mono text-xs text-content-tertiary">Dev harness · portfolio states from fixtures</p>
      <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
        <AppSegmented value={scene} onChange={setScene} options={SCENES} stretch={false} ariaLabel="Scene" />
      </div>

      {scene === "signed-out" ? (
        <PortfolioSignIn />
      ) : scene === "empty" ? (
        <PortfolioEmpty />
      ) : scene === "loading" ? (
        <>
          <LoadingStatus />
          <div className="mt-8 flex flex-col gap-2">
            <PerformanceSkeleton />
            <IncomeCard summaries={null} quoteMint="" onQuoteMint={setQuoteMint} state="pending" nowSec={now} />
          </div>
          <Section title="Positions">
            <PositionsSkeleton />
          </Section>
        </>
      ) : (
        <>
          {scene === "failed" ? (
            <p role="alert" className="mt-4 text-center font-mono text-sm text-error">
              Couldn&apos;t load your positions. The figures below may be incomplete.
            </p>
          ) : null}
          <div className="mt-8 flex flex-col gap-2">
            <PerformanceStrip pnl={data.pnl} apr={data.apr} trading={data.trading} unavailable={scene === "failed"} incomplete={scene === "grouped"} />
            <IncomeCard summaries={data.summaries} quoteMint={quoteMint} onQuoteMint={setQuoteMint} state={scene === "failed" ? "unavailable" : "ready"} nowSec={now} />
          </div>
          <Section title={`Positions · Open ${data.openRows.length}`}>
            {funding ? <FundingStrip summary={funding} nowMs={nowMs} pending={pending.size > 0} onFundAll={(positions) => fund(positions.map((p) => p.pda))} /> : null}
            {assetCounts.length > 1 || worthExercising.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {assetCounts.length > 1 ? <AssetFilter counts={assetCounts} total={data.openRows.length} value={shownAsset} onChange={setAssetFilter} /> : null}
                {worthExercising.length > 0 ? <ExerciseFilter count={worthExercising.length} active={exerciseOn} onChange={setExerciseOnly} /> : null}
              </div>
            ) : null}
            <PositionsTable rows={visibleOpenRows} nowMs={nowMs} grouped={scene === "grouped" && !shownAsset && !exerciseOn} deposit={deposit} />
          </Section>
          <Section title="Positions · History">
            <PositionsTable variant="history" rows={data.closedRows} nowMs={nowMs} grouped={false} />
          </Section>
        </>
      )}
    </div>
  );
}
