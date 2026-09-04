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
          Premium income
        </h2>

        <p
          className="max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Paid in USDC by the desks on the other side of the trade. None of the yield is minted, farmed or subsidised
        </p>
        <p
          className="mt-4 max-w-[620px] font-mono leading-[1.55] text-content-secondary"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          <a
            href="https://am.jpmorgan.com/us/en/asset-management/adv/investment-strategies/etf-investing/understanding-jp-morgans-derivative-income-offerings/"
            target="_blank"
            rel="noreferrer noopener"
            className="text-accent-secondary transition-colors hover:text-content-primary"
          >
            Derivative income
          </a>{" "}
          is not a crypto invention. Institutions have run this trade on equities for
          decades. We run it on-chain, on any tokenized asset
        </p>
      </div>
    </section>
  );
}
