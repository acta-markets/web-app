import { CAP_NOTE } from "@/lib/landing-vaults";
import { SectionMarker } from "./landing-primitives";

const MINT = "#80C9B6";
const MUTED = "#8A8A8A";
const LINE = "#282828";

/**
 * Schematic payoff, not plotted data. The SVG carries geometry only and stretches to
 * fill its box (preserveAspectRatio="none"), so percentage-positioned HTML labels stay
 * aligned to it at every width and keep the page's mono type size instead of shrinking
 * with the viewBox. Strokes use non-scaling-stroke to stay 1px through that stretch.
 */
function PayoffDiagram() {
  // viewBox units: 0..100 across, 0..100 down. Geometry leaves room under the holding
  // line for its label, and the target sits left of centre so the gap above it is wide
  // enough to read.
  const targetX = 55;
  const premium = 14; // vertical lift of the vault line over just holding

  const holdY = (x: number) => 80 - x * 0.58;
  const vaultY = (x: number) => Math.max(holdY(Math.min(x, targetX)) - premium, 8);

  return (
    <div className="relative mt-10 aspect-[16/9] w-full max-md:aspect-[1/1]">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {/* baseline */}
        <line
          x1="0"
          y1="92"
          x2="100"
          y2="92"
          stroke={LINE}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* target marker */}
        <line
          x1={targetX}
          y1="8"
          x2={targetX}
          y2="92"
          stroke={LINE}
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        {/* the gap above the target: what you give up */}
        <path
          d={`M ${targetX} ${vaultY(targetX)} L 100 ${holdY(100)} L 100 ${vaultY(100)} Z`}
          fill={MINT}
          opacity="0.10"
        />
        {/* just holding */}
        <line
          x1="0"
          y1={holdY(0)}
          x2="100"
          y2={holdY(100)}
          stroke={MUTED}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* in the vault: lifted by the premium, flat past the target */}
        <path
          d={`M 0 ${vaultY(0)} L ${targetX} ${vaultY(targetX)} L 100 ${vaultY(targetX)}`}
          fill="none"
          stroke={MINT}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* labels live in HTML so they keep mono 11px at every breakpoint */}
      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] uppercase">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-content-secondary"
          style={{ left: `${targetX}%`, top: "-3%", letterSpacing: "0.12em" }}
        >
          Target
        </span>
        {/* legend, not inline annotation: both lines are steep enough to cross any
            horizontal label placed against them. This corner stays empty at every
            aspect ratio. */}
        <div
          className="absolute flex flex-col gap-2"
          style={{ left: "58%", top: "58%" }}
        >
          <span className="flex items-center gap-2 whitespace-nowrap" style={{ color: MINT, letterSpacing: "0.12em" }}>
            <span className="inline-block h-[2px] w-4" style={{ background: MINT }} />
            In the vault
          </span>
          <span className="flex items-center gap-2 whitespace-nowrap text-content-secondary" style={{ letterSpacing: "0.12em" }}>
            <span className="inline-block h-px w-4" style={{ background: MUTED }} />
            Just holding
          </span>
        </div>
        <span
          className="absolute whitespace-nowrap text-content-secondary"
          style={{ right: "1%", top: "11%", letterSpacing: "0.12em" }}
        >
          Given up
        </span>
        <span
          className="absolute whitespace-nowrap text-content-tertiary"
          style={{ left: "0%", top: "96%", letterSpacing: "0.12em" }}
        >
          Price at the end of the cycle
        </span>
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
          The premium is yours either way. What you trade for it is the gain above a
          weekly target. Below the target the premium keeps you ahead of simply holding.
          Above it, you keep the target price.
        </p>

        <PayoffDiagram />

        {/* TODO(tim): link this once a page documents the cadence. It needs the
            measurement window and the asset it was measured on. Note that
            docs-site/reference/caps.md is NOT it: that page is capacity limits on quote
            submission, not upside caps. */}
        <p
          className="mt-8 max-w-[620px] font-mono text-[12px] text-content-tertiary"
          style={{ letterSpacing: "-0.02em" }}
        >
          {CAP_NOTE}
        </p>
      </div>
    </section>
  );
}
