import { CAP_NOTE } from "@/lib/landing-vaults";
import { SectionMarker } from "./landing-primitives";

const MINT = "#80C9B6";
const MUTED = "#8A8A8A";
const LINE = "#282828";

/**
 * Schematic portfolio paths over twelve weeks, not data. No axis numbers, because none
 * of these values were measured.
 *
 * VAULT is the same line as HOLD until the swap, so the mint path is drawn over the
 * grey one and the two read as one line. They fork at the swap: holding carries on, the
 * vault goes flat while the deposit sits in cash, and the wedge that opens between them
 * is what was given up.
 *
 * The SVG stretches to fill its box so percentage-positioned HTML labels stay aligned
 * and keep the page's mono type size, and every stroke is non-scaling so lines stay 1px
 * through that stretch.
 */
const HOLD = [100, 104, 101, 107, 110, 106, 113, 116, 134, 137, 133, 140, 145];
const VAULT = [100, 104, 101, 107, 110, 106, 113, 116, 116, 116, 116, 123, 128];
const SWAP_WEEK = 7; // the asset rips through here and the deposit is swapped
const BUYBACK_WEEK = 10; // it sits in cash for a few weeks before going back in
const DIVERGE_WEEK = 7; // the paths are one line until here, then they fork

function CapChart() {
  const x = (i: number) => (i / (HOLD.length - 1)) * 100;
  const y = (v: number) => 88 - (v - 96) * (78 / 54);
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");

  // wedge between the two paths, from where holding pulls ahead to the end
  const givenUp = [
    ...HOLD.slice(DIVERGE_WEEK).map(
      (v, i) => `${i === 0 ? "M" : "L"} ${x(i + DIVERGE_WEEK)} ${y(v)}`,
    ),
    ...VAULT.slice(DIVERGE_WEEK)
      .reverse()
      .map((v, i) => `L ${x(HOLD.length - 1 - i)} ${y(v)}`),
    "Z",
  ].join(" ");

  return (
    <div className="relative mt-10 aspect-[16/9] w-full max-md:aspect-[4/3]">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <line
          x1="0"
          y1="92"
          x2="100"
          y2="92"
          stroke={LINE}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* the hot week */}
        <rect
          x={x(SWAP_WEEK)}
          y="4"
          width={x(SWAP_WEEK + 1) - x(SWAP_WEEK)}
          height={88}
          fill={MUTED}
          opacity="0.05"
        />
        <path d={givenUp} fill={MINT} opacity="0.12" />
        <path
          d={path(HOLD)}
          fill="none"
          stroke={MUTED}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path(VAULT)}
          fill="none"
          stroke={MINT}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] uppercase">
        {/* the two ends of the flat: the swap, and the buy-back that follows it. Square
            markers rather than circles because the SVG stretches and would turn a circle
            into an ellipse, so these live in HTML instead. */}
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{
            left: `${x(SWAP_WEEK) - 4}%`,
            top: `${y(VAULT[SWAP_WEEK]) - 9}%`,
            color: MINT,
            letterSpacing: "0.12em",
          }}
        >
          Swapped
        </span>
        <span
          className="absolute whitespace-nowrap"
          style={{
            left: `${x(BUYBACK_WEEK) - 2}%`,
            top: `${y(VAULT[BUYBACK_WEEK]) + 7}%`,
            color: MINT,
            letterSpacing: "0.12em",
          }}
        >
          Bought back
        </span>
        <span
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${x(SWAP_WEEK)}%`,
            top: `${y(VAULT[SWAP_WEEK])}%`,
            background: MINT,
          }}
        />
        <span
          className="absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${x(BUYBACK_WEEK)}%`,
            top: `${y(VAULT[BUYBACK_WEEK])}%`,
            background: MINT,
          }}
        />
        <span
          className="absolute whitespace-nowrap text-content-secondary"
          style={{ right: "1%", top: "10%", letterSpacing: "0.12em" }}
        >
          Given up
        </span>
        {/* legend, not inline annotation: the paths wander, so nothing sits safely
            against them at every aspect ratio. Both start low-left, so this corner
            stays clear. */}
        <div className="absolute flex flex-col gap-2" style={{ left: "2%", top: "4%" }}>
          <span
            className="flex items-center gap-2 whitespace-nowrap"
            style={{ color: MINT, letterSpacing: "0.12em" }}
          >
            <span className="inline-block h-[2px] w-4" style={{ background: MINT }} />
            In the vault
          </span>
          <span
            className="flex items-center gap-2 whitespace-nowrap text-content-secondary"
            style={{ letterSpacing: "0.12em" }}
          >
            <span className="inline-block h-px w-4" style={{ background: MUTED }} />
            Just holding
          </span>
        </div>
      </div>
    </div>
  );
}

export function LandingRisk() {
  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Risk" color="#FF8A3C" />
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          What you give up
        </h2>

        <p
          className="max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Most weeks nothing happens to your deposit. In a week where the asset rips, it
          is swapped at the agreed price and bought back after.
        </p>

        <CapChart />

        {/* accent-coloured on purpose, and deliberately NOT a link: there is no page
            documenting the cadence yet. Do not add an href here without a destination
            that actually shows the measurement, and do not "fix" the colour back to
            tertiary either. */}
        <p
          className="mt-8 max-w-[620px] font-mono text-[12px] text-accent-secondary"
          style={{ letterSpacing: "-0.02em" }}
        >
          {CAP_NOTE}
        </p>
      </div>
    </section>
  );
}
