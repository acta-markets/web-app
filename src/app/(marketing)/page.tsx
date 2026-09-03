import type { Metadata } from "next";
import { Footer } from "@/components/sections/footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
// TODO: re-enable once we have real historical data to display
// import { LandingStats } from "@/components/landing/landing-stats";
import { LandingVaults } from "@/components/landing/landing-vaults";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingYieldSource } from "@/components/landing/landing-yield-source";
import { LandingCurators } from "@/components/landing/landing-curators";
import { LandingTrust } from "@/components/landing/landing-trust";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
  // root layout applies the "%s | Acta" template, so the brand is not repeated here
  title: "Extra yield on SOL and tokenized stocks",
  description:
    "Curated yield vaults for SOL and tokenized stocks. Deposit, keep your exposure, get paid weekly in cash by trading desks. No leverage, no liquidations.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <LandingHeader />
      <main>
        <LandingHero />
        {/* <LandingStats /> — hidden until we have real historical data */}
        <LandingVaults />
        <LandingHowItWorks />
        <LandingYieldSource />
        <LandingCurators />
        <LandingTrust />
        <LandingFaq />
        <LandingCta />
      </main>
      <Footer />
    </div>
  );
}
