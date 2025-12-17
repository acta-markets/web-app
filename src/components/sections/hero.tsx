import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function Hero() {
  return (
    <header className="relative flex min-h-screen flex-col items-center justify-center bg-off-white px-4 pb-12 pt-24 text-center">
      <div className="relative z-10 w-full max-w-3xl">
        <Card hoverNeo={false} className="bg-white p-8 shadow-neo md:p-16">
          <Badge className="absolute -left-6 -top-6 rotate-[-5deg] bg-yuzu-accent text-white">
            CLOSED BETA
          </Badge>

          <h1 className="glitch-header mb-6 cursor-default text-6xl font-black leading-[0.9] tracking-tighter md:text-8xl">
            OPTIONS <br /> MADE <br />{" "}
            <span className="bg-black px-4 text-yuzu-main">RIGHT.</span>
          </h1>

          <p className="mx-auto max-w-2xl border-t-4 border-black pt-6 text-xl font-bold md:text-2xl">
            Upfront premiums with up to 180% APY. <br />
            Trustless settlement with zero liquidation risk.
          </p>

          <div className="mt-10 flex flex-col justify-center gap-4 md:flex-row">
            <ButtonLink href="#whitelist" variant="primary" size="lg">
              Join Whitelist
            </ButtonLink>
            <Button variant="secondary" size="lg">
              Read Docs
            </Button>
          </div>
        </Card>
      </div>

      <div className="absolute left-10 top-1/3 hidden h-24 w-24 animate-bounce rounded-full border-4 border-black bg-yuzu-accent shadow-neo lg:block" />
      <div className="absolute bottom-20 right-20 hidden h-32 w-32 rotate-45 border-4 border-black bg-yuzu-main shadow-neo lg:block" />
    </header>
  );
}


