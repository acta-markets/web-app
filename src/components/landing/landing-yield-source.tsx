import { SectionMarker } from "./landing-primitives";

export function LandingYieldSource() {
  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Where it comes from" />
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Someone else pays
        </h2>

        <p
          className="max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Trading desks pay a cash premium upfront, every week, in USDC. Nothing here is
          minted, farmed or subsidised.
        </p>
        <p
          className="mt-4 max-w-[620px] font-mono leading-[1.55] text-content-secondary"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Derivative income is not a crypto invention. Pension funds and asset managers
          have run this trade on equities for decades. We run it on-chain, on assets with
          more vol.
        </p>
      </div>
    </section>
  );
}
