import { LandingButton, SectionMarker } from "./landing-primitives";

export function LandingCta() {
  return (
    <section
      className="relative overflow-hidden border-t border-bg-border py-[140px] max-md:py-24"
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundColor: "#072C28" }}
      />
      <div
        aria-hidden
        className="absolute"
        style={{
          inset: "-10%",
          backgroundImage: "url(/landing/ascii-mountain.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          mixBlendMode: "color-dodge",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(7,44,40,0.3) 0%, rgba(7,44,40,0.85) 100%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Get started" color="#B0E8D6" />
        <div
          className="mb-5 text-left font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(56px, 9vw, 96px)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          Put your assets
          <br />
          <span className="italic" style={{ color: "#B0E8D6" }}>
            to work.
          </span>
        </div>
        <div className="flex flex-wrap justify-start gap-3">
          <LandingButton variant="primary" size="lg" href="/earn">
            Launch app ↗
          </LandingButton>
          <LandingButton
            variant="ghost"
            size="lg"
            href="https://docs.acta.markets"
            external
          >
            Read docs
          </LandingButton>
        </div>
      </div>
    </section>
  );
}
