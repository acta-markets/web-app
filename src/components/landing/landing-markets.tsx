import Link from "next/link";
import { SectionMarker } from "./landing-primitives";
import { LandingYieldsGrid } from "./landing-yields-grid";

export function LandingMarkets() {
  return (
    <section className="relative px-8 pb-10 pt-20 max-md:px-5 max-md:pt-14">
      {/* pink ASCII marginalia bleeding in from right */}
      <div
        aria-hidden
        className="pointer-events-none absolute overflow-hidden max-md:hidden"
        style={{
          top: 40,
          right: -80,
          width: 320,
          height: 240,
          opacity: 0.45,
        }}
      >
        <div className="absolute inset-0" style={{ backgroundColor: "#3A0F2C" }} />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/landing/ascii-pipes.png)",
            backgroundSize: "cover",
            mixBlendMode: "screen",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-[1200px]">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionMarker label="// Markets" />
            <h2
              className="m-0 font-space font-semibold text-content-primary"
              style={{
                fontSize: "clamp(44px, 7vw, 80px)",
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
              }}
            >
              Live yields.
            </h2>
          </div>
          <Link
            href="/earn"
            className="inline-flex items-center gap-2 border border-accent-primary px-4 py-2.5 font-mono text-[13px] text-accent-secondary transition-colors hover:bg-[rgba(42,162,134,0.1)]"
            style={{ letterSpacing: "-0.02em" }}
          >
            See all markets →
          </Link>
        </div>
        <LandingYieldsGrid />
      </div>
    </section>
  );
}
