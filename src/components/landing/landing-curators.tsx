import { CURATOR_CONTACT_URL } from "@/lib/landing-vaults";
import { LandingButton, SectionMarker } from "./landing-primitives";

const POINTS = [
  "Your asset, any SOL LST or tokenized stock with volume",
  "Your validator, staking stays where it is",
  "Your brand, your users, your revenue share",
];

export function LandingCurators() {
  return (
    <section
      id="curators"
      className="scroll-mt-[88px] py-[120px] max-md:scroll-mt-[76px] max-md:py-20"
    >
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Curators" color="#FF60BD" />
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Launch a vault
        </h2>

        <p
          className="mb-10 max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Run a vault on your asset. Your LST, your validator, your users. Acta runs the
          income layer and you take a share of the revenue.
        </p>

        <div className="mb-10 border border-bg-border">
          {POINTS.map((point, i) => (
            <div
              key={point}
              className={`px-6 py-5 font-mono text-sm text-content-secondary max-md:px-5 ${
                i < POINTS.length - 1 ? "border-b border-bg-border" : ""
              }`}
              style={{ letterSpacing: "-0.02em", lineHeight: 1.6 }}
            >
              {point}
            </div>
          ))}
        </div>

        <LandingButton variant="primary" size="lg" href={CURATOR_CONTACT_URL} external>
          Talk to us ↗
        </LandingButton>
      </div>
    </section>
  );
}
