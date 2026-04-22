/* eslint-disable @next/next/no-img-element */
import { getTokenLogo } from "@/lib/tokens";
import { ChevronRightDuoIcon } from "./landing-primitives";

type Row = {
  symbol: string;
  type: "Call" | "Put";
  apr: string;
  cap: number;
};

const ROWS: Row[] = [
  { symbol: "jitoSOL", type: "Call", apr: "12% – 34%", cap: 54 },
  { symbol: "JLP", type: "Call", apr: "9% – 28%", cap: 41 },
  { symbol: "zBTC", type: "Call", apr: "14% – 41%", cap: 31 },
  { symbol: "SOL", type: "Call", apr: "11% – 36%", cap: 68 },
  { symbol: "USDC", type: "Put", apr: "8% – 22%", cap: 78 },
  { symbol: "USDC", type: "Put", apr: "10% – 26%", cap: 45 },
];

const HEADERS = ["Asset", "Type", "APR", "Cap", ""] as const;

const COLS = "minmax(160px,1.5fr) minmax(80px,0.8fr) minmax(110px,1fr) minmax(160px,1fr) 40px";

export function LandingYieldsGrid() {
  return (
    <div className="border border-bg-border overflow-x-auto">
      <div className="min-w-[640px]">
        <div
          className="grid gap-2 border-b border-bg-border px-6 py-3.5"
          style={{ gridTemplateColumns: COLS, background: "rgba(240,240,240,0.02)" }}
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
        {ROWS.map((row, i) => (
          <div
            key={i}
            className={`grid items-center gap-2 px-6 py-4 font-mono text-[13px] font-medium text-content-primary ${
              i < ROWS.length - 1 ? "border-b border-bg-border" : ""
            }`}
            style={{ gridTemplateColumns: COLS, letterSpacing: "-0.02em" }}
          >
            <span className="flex items-center gap-2.5">
              <span
                className="inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full"
                style={{ background: "#F0F0F0" }}
              >
                <img
                  src={getTokenLogo(row.symbol)}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </span>
              {row.symbol}
            </span>
            <span style={{ color: row.type === "Call" ? "#80C9B6" : "#F0F0F0" }}>
              {row.type}
            </span>
            <span>{row.apr}</span>
            <span className="flex items-center gap-2">
              {row.cap}%
              <span
                className="inline-block h-[5px] w-[50px]"
                style={{
                  background: "rgba(42,162,134,0.2)",
                  border: "1px solid #2AA286",
                }}
              >
                <span
                  className="block h-full"
                  style={{ width: `${row.cap}%`, background: "#2AA286" }}
                />
              </span>
            </span>
            <span className="flex justify-end">
              <ChevronRightDuoIcon />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
