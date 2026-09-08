import { LandingButton } from "./landing-primitives";
import { PARTNERS_CONTACT_URL } from "./landing-partners-contact";

export function LandingPartnersHero() {
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
            {/* square rather than the hero's pulsing dot: a label, not a status */}
            <span
              className="inline-block h-1.5 w-1.5"
              style={{ background: "#2AA286", boxShadow: "0 0 10px #2AA286" }}
            />
            Partnerships
          </div>
          <h1
            className="m-0 font-space font-semibold text-content-primary"
            style={{
              // matches the home hero so the two entry points read as one site
              fontSize: "clamp(48px, 9vw, 96px)",
              lineHeight: 0.95,
              letterSpacing: "-0.04em",
            }}
          >
            Plug into
            <br />
            <span className="italic text-accent-secondary">the venue</span>
          </h1>
          <p
            className="mb-9 mt-12 max-w-[560px] font-mono leading-[1.55] text-[#E8E8E8] max-md:mt-8"
            style={{ fontSize: 16, letterSpacing: "-0.02em" }}
          >
            Acta runs its own options venue on Solana. Desks quote the flow, apps route
            deposits into curated vaults, treasuries put idle assets to work
          </p>
          <div className="inline-flex flex-wrap gap-3">
            <LandingButton
              variant="primary"
              size="lg"
              href={PARTNERS_CONTACT_URL}
              external
            >
              Get in touch ↗
            </LandingButton>
            <LandingButton variant="ghost" size="lg" href="/docs">
              Read docs
            </LandingButton>
          </div>
        </div>
      </div>
    </section>
  );
}
