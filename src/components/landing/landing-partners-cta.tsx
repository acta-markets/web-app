import { PARTNER_EMAIL } from "@/lib/landing-vaults";
import { LandingButton } from "./landing-primitives";
import { PARTNERS_CONTACT_URL } from "./landing-partners-contact";

export function LandingPartnersCta() {
  return (
    <section className="relative overflow-hidden border-t border-bg-border py-[140px] max-md:py-24">
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
        <div
          className="mb-5 text-left font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(56px, 9vw, 96px)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          Come quote
          <br />
          the{" "}
          <span className="italic" style={{ color: "#B0E8D6" }}>
            flow
          </span>
        </div>
        <p
          className="mb-9 max-w-[560px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Tell us which side you are on and we will get you connected
        </p>
        <div className="flex flex-wrap justify-start gap-3">
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
        {/* the address the vault card used to point at, kept reachable */}
        <p
          className="mt-6 font-mono text-[#B0E8D6]"
          style={{ fontSize: 14, letterSpacing: "-0.02em" }}
        >
          or email{" "}
          <a
            href={`mailto:${PARTNER_EMAIL}`}
            className="underline underline-offset-4 transition-colors hover:text-content-primary"
          >
            {PARTNER_EMAIL}
          </a>
        </p>
      </div>
    </section>
  );
}
