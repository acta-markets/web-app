import type { Metadata } from "next";
import { Footer } from "@/components/sections/footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
// TODO: re-enable once we have real historical data to display
// import { LandingStats } from "@/components/landing/landing-stats";
import { LandingVaults } from "@/components/landing/landing-vaults";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingYieldSource } from "@/components/landing/landing-yield-source";
import { LandingRisk } from "@/components/landing/landing-risk";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
  // root layout applies the "%s | Acta" template, so the brand is not repeated here
  title: "Curated yield vaults on a Solana options venue",
  description:
    "Curated yield vaults for the assets you already hold, on Acta's own options venue. Vaults earn USDC from trading desks. No leverage, no liquidations.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <LandingHeader />
      <main>
        <LandingHero />
        {/* <LandingStats /> hidden until we have real historical data */}
        <LandingVaults />
        <LandingHowItWorks />
        <LandingYieldSource />
        <LandingRisk />
        <LandingFaq />
        <LandingCta />
      </main>
      <Footer />
    </div>
  );
}
