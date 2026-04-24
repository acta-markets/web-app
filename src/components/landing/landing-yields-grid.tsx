/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { MARKETS, type Market } from "@/lib/markets";
import { getTokenLogo } from "@/lib/tokens";
import { ChevronRightDuoIcon } from "./landing-primitives";

const HEADERS = ["Asset", "Type", "APR", "Cap", ""] as const;
const COLS =
  "minmax(160px,1.5fr) minmax(80px,0.8fr) minmax(110px,1fr) minmax(160px,1fr) 40px";

function formatApr(min: number, max: number) {
  if (min === max) return `${min}%`;
  return `${min}% – ${max}%`;
}

function marketHref(m: Market) {
  return `/market/${encodeURIComponent(m.asset.toLowerCase())}?type=${m.type}`;
}

export function LandingYieldsGrid() {
  // Only show markets with actual yield data — skip placeholder rows
  // (e.g. SOL seeded with zeros in lib/markets.ts).
  const rows = MARKETS.filter((m) => m.maxApr > 0).slice(0, 8);

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
        {rows.map((row, i) => {
          const label = row.type === "call" ? "Call" : "Put";
          return (
            <Link
              key={`${row.asset}-${row.type}`}
              href={marketHref(row)}
              className={`grid items-center gap-2 px-6 py-4 font-mono text-[13px] font-medium text-content-primary transition-colors hover:bg-[rgba(240,240,240,0.03)] ${
                i < rows.length - 1 ? "border-b border-bg-border" : ""
              }`}
              style={{
                gridTemplateColumns: COLS,
                letterSpacing: "-0.02em",
              }}
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
                style={{
                  color: row.type === "call" ? "#80C9B6" : "#F0F0F0",
                }}
              >
                {label}
              </span>
              <span>{formatApr(row.minApr, row.maxApr)}</span>
              <span className="flex items-center gap-2">
                {row.capFilledPct}%
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
        })}
      </div>
    </div>
  );
}
