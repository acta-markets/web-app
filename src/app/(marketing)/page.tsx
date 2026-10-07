import type { Metadata } from "next";
import { Footer } from "@/components/sections/footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingVaults } from "@/components/landing/landing-vaults";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingYieldSource } from "@/components/landing/landing-yield-source";
import { LandingRisk } from "@/components/landing/landing-risk";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
  title: "Curated yield vaults on a Solana options venue",
  description:
    "Curated yield vaults for the assets you already hold, on Acta's own options venue. Vaults earn yield from trading desks. No liquidations.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <LandingHeader />
      <main>
        <LandingHero />
        {                                                                }
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
