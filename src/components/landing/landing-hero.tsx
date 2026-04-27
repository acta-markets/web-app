import { LandingButton } from "./landing-primitives";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden" style={{ backgroundColor: "#000" }}>
      {/* layer 1: ASCII noise */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "url(/landing/bg8-ascii.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.24,
        }}
      />
      {/* layer 2: big Acta A-mark silhouette */}
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 top-0 max-md:hidden"
        style={{
          right: "-5%",
          width: "65%",
          mixBlendMode: "hard-light",
          backgroundImage: "url(/landing/bg8-texture.png)",
          backgroundSize: "contain",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right center",
        }}
      />
      {/* layer 3: bottom fade to black */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0) 37%, #000 100%)",
        }}
      />

      <div className="relative mx-auto max-w-[1200px] px-8 pb-[140px] pt-[120px] max-md:px-5 max-md:pb-[96px] max-md:pt-[72px]">
        <div className="max-w-[720px]">
          <div
            className="mb-8 inline-flex items-center gap-[10px] font-mono text-[12px] uppercase text-accent-secondary"
            style={{ letterSpacing: "0.18em" }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "#2AA286", boxShadow: "0 0 10px #2AA286" }}
            />
            Live in beta
          </div>
          <h1
            className="m-0 font-space font-semibold text-content-primary"
            style={{
              fontSize: "clamp(64px, 12vw, 140px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            Earn
            <br />
            <span className="italic text-accent-secondary">yield</span>
          </h1>
          <p
            className="mb-9 mt-12 max-w-[520px] font-mono leading-[1.55] text-[#E8E8E8] max-md:mt-8"
            style={{ fontSize: 16, letterSpacing: "-0.02em" }}
          >
            Get paid upfront to sell higher or commit to buy lower. <br /> Keep the yield either way.          </p>
          <div className="inline-flex flex-wrap gap-3">
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
      </div>
    </section>
  );
}
