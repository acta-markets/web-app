import { Metadata } from "next";
import { Navbar } from "@/components/sections/navbar";
import { Hero } from "@/components/sections/hero";
import { Marquee } from "@/components/sections/marquee";
import { Architecture } from "@/components/sections/architecture";
import { Solution } from "@/components/sections/solution";
import { Whitelist } from "@/components/sections/whitelist";
import { Team } from "@/components/sections/team";
import { Footer } from "@/components/sections/footer";

export const metadata: Metadata = {
  title: "About"
};

export default function AboutPage() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        <Architecture />
        <Solution />
        <Whitelist />
        <Team />
      </main>
      <Footer />
    </>
  );
}

