"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatPct, type MarketType } from "@/lib/markets";
import { getTokenLogo, normalizeTokenSymbol } from "@/lib/tokens";
import {
  createRfqClient,
  type ActaWsClient,
  type EarnAssetSummary,
} from "@/lib/rfq-client";
import { ChevronRightDuoIcon } from "./landing-primitives";

type Row = {
  asset: string;
  type: MarketType;
  minAprPct: number | null;
  maxAprPct: number | null;
  capFilledPct: number;
};

const HEADERS = ["Asset", "Type", "APR", "Cap", ""] as const;
const COLS =
  "minmax(160px,1.5fr) minmax(80px,0.8fr) minmax(110px,1fr) minmax(160px,1fr) 40px";
const PREFERRED = ["SOL", "jitoSOL", "JLP", "zBTC", "PUMP", "BONK", "USDC"];
const MAX_ROWS = 8;

function summaryToRow(s: EarnAssetSummary): Row {
  const type: MarketType = s.position_type === "cash_secured_put" ? "csp" : "call";
  return {
    asset: s.underlying_symbol ? normalizeTokenSymbol(s.underlying_symbol) : "?",
    type,
    minAprPct: s.min_apr != null ? s.min_apr * 100 : null,
    maxAprPct: s.max_apr != null ? s.max_apr * 100 : null,
    capFilledPct: Math.max(0, Math.min(100, (s.cap_filled_pct ?? 0) * 100)),
  };
}

function formatAprRange(row: Row): string {
  if (row.minAprPct == null || row.maxAprPct == null) return "—";
  if (Math.round(row.minAprPct) === Math.round(row.maxAprPct))
    return formatPct(row.minAprPct);
  return `${formatPct(row.minAprPct)}–${formatPct(row.maxAprPct)}`;
}

function marketHref(row: Row) {
  return `/market/${encodeURIComponent(row.asset.toLowerCase())}?type=${row.type}`;
}

function sortByPreferredAsset(a: Row, b: Row) {
  const order = new Map(PREFERRED.map((s, i) => [s.toUpperCase(), i]));
  const ai = order.get(a.asset.toUpperCase()) ?? 999;
  const bi = order.get(b.asset.toUpperCase()) ?? 999;
  if (ai !== bi) return ai - bi;
  // Calls before puts when same asset
  if (a.type !== b.type) return a.type === "call" ? -1 : 1;
  return 0;
}

export function LandingYieldsGrid() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const clientRef = useRef<ActaWsClient | null>(null);

  useEffect(() => {
    let cancelled = false;
    const client = createRfqClient();
    clientRef.current = client;

    const onEarnSummary = (data: { summaries?: EarnAssetSummary[] } | EarnAssetSummary[]) => {
      if (cancelled) return;
      const list: EarnAssetSummary[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.summaries)
        ? data.summaries
        : [];
      const mapped = list.map(summaryToRow);
      setRows(mapped);
    };

    const typedClient = client as unknown as {
      on: (ev: string, cb: (d?: unknown) => void) => void;
      getEarnSummary: () => void;
    };
    typedClient.on("earnSummary", onEarnSummary as (d?: unknown) => void);
    typedClient.on("connected", () => {
      if (cancelled) return;
      typedClient.getEarnSummary();
    });

    try {
      client.connectAnonymous();
    } catch (err) {
      console.warn("[landing] RFQ connectAnonymous failed:", err);
    }

    return () => {
      cancelled = true;
      try {
        client.disconnect();
      } catch {
        /* noop */
      }
      clientRef.current = null;
    };
  }, []);

  const displayRows = useMemo(() => {
    if (!rows) return null;
    return [...rows].sort(sortByPreferredAsset).slice(0, MAX_ROWS);
  }, [rows]);

  return (
    <div className="overflow-x-auto border border-bg-border">
      <div className="min-w-[640px]">
        <div
          className="grid gap-2 border-b border-bg-border px-6 py-3.5"
          style={{
            gridTemplateColumns: COLS,
            background: "rgba(240,240,240,0.02)",
          }}
        >
          {HEADERS.map((h, i) => (
            <span
              key={i}
              className="font-mono text-[12px] text-content-secondary"
              style={{ letterSpacing: "-0.02em" }}
            >
              {h}
            </span>
          ))}
        </div>
        {displayRows === null ? (
          <YieldsSkeleton />
        ) : displayRows.length === 0 ? (
          <div className="px-6 py-8 font-mono text-[13px] text-content-secondary">
            No live markets available right now.
          </div>
        ) : (
          displayRows.map((row, i) => {
            const label = row.type === "call" ? "Call" : "Put";
            return (
              <Link
                key={`${row.asset}-${row.type}`}
                href={marketHref(row)}
                className={`grid items-center gap-2 px-6 py-4 font-mono text-[13px] font-medium text-content-primary transition-colors hover:bg-[rgba(240,240,240,0.03)] ${
                  i < displayRows.length - 1 ? "border-b border-bg-border" : ""
                }`}
                style={{ gridTemplateColumns: COLS, letterSpacing: "-0.02em" }}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full"
                    style={{ background: "#F0F0F0" }}
                  >
                    <img
                      src={getTokenLogo(row.asset)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </span>
                  {row.asset}
                </span>
                <span
                  style={{ color: row.type === "call" ? "#80C9B6" : "#F0F0F0" }}
                >
                  {label}
                </span>
                <span>{formatAprRange(row)}</span>
                <span className="flex items-center gap-2">
                  {Math.round(row.capFilledPct)}%
                  <span
                    className="inline-block h-[5px] w-[50px]"
                    style={{
                      background: "rgba(42,162,134,0.2)",
                      border: "1px solid #2AA286",
                    }}
                  >
                    <span
                      className="block h-full"
                      style={{
                        width: `${row.capFilledPct}%`,
                        background: "#2AA286",
                      }}
                    />
                  </span>
                </span>
                <span className="flex justify-end">
                  <ChevronRightDuoIcon />
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function YieldsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={`grid items-center gap-2 px-6 py-4 font-mono text-[13px] text-content-secondary ${
            i < 3 ? "border-b border-bg-border" : ""
          }`}
          style={{ gridTemplateColumns: COLS, letterSpacing: "-0.02em" }}
        >
          <span className="flex items-center gap-2.5">
            <span
              className="inline-block h-6 w-6 rounded-full"
              style={{ background: "rgba(240,240,240,0.08)" }}
            />
            <span
              className="inline-block h-3 w-14"
              style={{ background: "rgba(240,240,240,0.06)" }}
            />
          </span>
          <span
            className="inline-block h-3 w-10"
            style={{ background: "rgba(240,240,240,0.06)" }}
          />
          <span
            className="inline-block h-3 w-20"
            style={{ background: "rgba(240,240,240,0.06)" }}
          />
          <span className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-8"
              style={{ background: "rgba(240,240,240,0.06)" }}
            />
            <span
              className="inline-block h-[5px] w-[50px]"
              style={{ background: "rgba(240,240,240,0.06)" }}
            />
          </span>
          <span />
        </div>
      ))}
    </>
  );
}
