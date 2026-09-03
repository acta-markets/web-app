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

      <div className="relative mx-auto w-full max-w-[850px] pb-[140px] pt-[120px] max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pb-[96px] max-md:pt-[72px]">
        <div className="max-w-[720px]">
          <div
            className="mb-8 inline-flex items-center gap-[10px] font-mono text-[12px] uppercase text-accent-secondary"
            style={{ letterSpacing: "0.18em" }}
          >
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: "#2AA286", boxShadow: "0 0 10px #2AA286" }}
            />
            Live on Solana mainnet
          </div>
          <h1
            className="m-0 font-space font-semibold text-content-primary"
            style={{
              fontSize: "clamp(64px, 12vw, 140px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            Extra yield
            <br />
            {/* line 2 is much longer than line 1, so it steps down to hold two lines on desktop */}
            <span
              className="italic text-accent-secondary"
              style={{ fontSize: "clamp(32px, 5vw, 60px)", lineHeight: 1.1 }}
            >
              on what you already hold.
            </span>
          </h1>
          <p
            className="mb-9 mt-12 max-w-[560px] font-mono leading-[1.55] text-[#E8E8E8] max-md:mt-8"
            style={{ fontSize: 16, letterSpacing: "-0.02em" }}
          >
            Acta is curated yield vaults for SOL and tokenized stocks. Deposit, keep your
            exposure, get paid weekly in cash by trading desks. No leverage, no
            liquidations.
          </p>
          <div className="inline-flex flex-wrap gap-3">
            <LandingButton variant="primary" size="lg" href="/#vaults">
              Explore vaults
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
