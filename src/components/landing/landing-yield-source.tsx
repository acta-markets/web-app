import { CAP_NOTE, SOL_VAULT, totalApr } from "@/lib/landing-vaults";
import { LandingBar, SectionMarker } from "./landing-primitives";

export function LandingYieldSource() {
  const staking = SOL_VAULT?.apr?.staking ?? 0;
  const total = (SOL_VAULT && totalApr(SOL_VAULT)) || 0;

  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Where it comes from" />
        <h2
          className="mb-12 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Two bars.
        </h2>

        <div className="flex flex-col gap-6">
          <LandingBar
            value={staking}
            max={total}
            color="#2AA286"
            caption={`Staking ~${staking}%`}
            height={12}
          />
          <LandingBar
            value={total}
            max={total}
            color="#80C9B6"
            caption={`With Acta ~${total}%`}
            height={12}
          />
        </div>

        <div
          className="mt-5 font-mono text-[12px] text-content-tertiary"
          style={{ letterSpacing: "-0.02em" }}
        >
          {CAP_NOTE}
        </div>

        <p
          className="mt-10 max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Desks pay for exposure. You keep the asset, they pay for the upside past a
          weekly target.
        </p>
        <p
          className="mt-4 max-w-[620px] font-mono leading-[1.55] text-content-secondary"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          The same covered-call strategy TradFi runs on the S&amp;P — we run it on-chain,
          on assets with more vol.
        </p>
      </div>
    </section>
  );
}
