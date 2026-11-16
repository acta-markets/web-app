import type { Metadata } from "next";
import { Footer } from "@/components/sections/footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingPartnersHero } from "@/components/landing/landing-partners-hero";
import { LandingPartnersTracks } from "@/components/landing/landing-partners-tracks";
import { LandingPartnersStack } from "@/components/landing/landing-partners-stack";
import { LandingPartnersCta } from "@/components/landing/landing-partners-cta";
import { pageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Partners",
  description:
    "Partner with Acta's options venue on Solana. Trading desks quote the flow, apps route deposits into curated vaults, treasuries put idle assets to work.",
  path: "/partners",
});

export default function PartnersPage() {
  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <LandingHeader />
      <main>
        <LandingPartnersHero />
        <LandingPartnersTracks />
        <LandingPartnersStack />
        <LandingPartnersCta />
      </main>
      <Footer />
    </div>
  );
}
