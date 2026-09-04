import { CAP_NOTE } from "@/lib/landing-vaults";
import { SectionMarker } from "./landing-primitives";

const MINT = "#80C9B6";
const MUTED = "#8A8A8A";
const LINE = "#282828";

/**
 * Payoff shape, schematic. Below the cap the vault is the same line as holding, so the
 * mint path is drawn over the grey one and they read as one. Above the cap the vault
 * goes flat and the two separate: that gap is what was given up.
 *
 * The bars are texture, not measured data, which is why nothing labels or scales them.
 *
 * The SVG stretches to fill its box so percentage-positioned HTML labels stay aligned
 * and keep the page's mono type size, and every stroke is non-scaling so lines stay 1px
 * through that stretch.
 */
const AXIS_Y = 64;
const CAP_X = 56;
const START = { x: 4, y: 92 };
const END_Y = 12; // where holding finishes at the right edge
const capY = START.y + ((END_Y - START.y) * (CAP_X - START.x)) / (96 - START.x);

const BARS = [
  10, 16, 12, 22, 18, 28, 24, 33, 27, 36, 31, 40, 35, 32, 38, 30, 34, 26, 30, 22, 26, 18,
  22, 14, 17, 11,
];

function CapChart() {
  return (
    <div className="relative mt-10 aspect-[16/9] w-full max-md:aspect-[4/3]">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {BARS.map((h, i) => {
          const w = 100 / BARS.length;
          return (
            <rect
              key={i}
              x={i * w + w * 0.15}
              y={AXIS_Y - h}
              width={w * 0.7}
              height={h}
              fill={MINT}
              opacity="0.07"
            />
          );
        })}

        {/* zero line */}
        <line
          x1="0"
          y1={AXIS_Y}
          x2="100"
          y2={AXIS_Y}
          stroke={LINE}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* the cap */}
        <line
          x1={CAP_X}
          y1="6"
          x2={CAP_X}
          y2={AXIS_Y}
          stroke={LINE}
          strokeWidth="1"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        {/* what the flat line gives up to the diagonal */}
        <path
          d={`M ${CAP_X} ${capY} L 96 ${END_Y} L 96 ${capY} Z`}
          fill={MINT}
          opacity="0.12"
        />
        {/* just holding: one diagonal all the way across */}
        <line
          x1={START.x}
          y1={START.y}
          x2="96"
          y2={END_Y}
          stroke={MUTED}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        {/* in the vault: the same line, then flat. Drawn over the grey below the cap so
            the two read as one until they separate. */}
        <path
          d={`M ${START.x} ${START.y} L ${CAP_X} ${capY} L 96 ${capY}`}
          fill="none"
          stroke={MINT}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 font-mono text-[11px] uppercase">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${CAP_X}%`, top: "-3%", color: MINT, letterSpacing: "0.12em" }}
        >
          Cap
        </span>
        <span
          className="absolute whitespace-nowrap text-content-secondary"
          style={{ right: "1%", top: "3%", letterSpacing: "0.12em" }}
        >
          Given up
        </span>
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
        <span
          className="absolute whitespace-nowrap text-content-tertiary"
          style={{ right: "1%", top: `${AXIS_Y + 2}%`, letterSpacing: "0.12em" }}
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
          Most weeks nothing happens to your deposit. In a week where the asset rips, it
          is swapped at the cap and bought back after.
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
