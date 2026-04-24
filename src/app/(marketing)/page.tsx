import type { Metadata } from "next";
import { Footer } from "@/components/sections/footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
// TODO: re-enable once we have real historical data to display
// import { LandingStats } from "@/components/landing/landing-stats";
import { LandingMarkets } from "@/components/landing/landing-markets";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
  title: "Acta — Earn premium on Solana",
  description:
    "Structured yield on Solana. Sell upside or downside you weren't going to take, keep the premium either way. Non-custodial, on-chain at maturity.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <LandingHeader />
      <main>
        <LandingHero />
        {/* <LandingStats /> — hidden until we have real historical data */}
        <LandingMarkets />
        <LandingHowItWorks />
        <LandingFaq />
        <LandingCta />
      </main>
      <Footer />
    </div>
  );
}
