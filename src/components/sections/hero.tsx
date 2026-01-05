import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";

export function Hero() {
  return (
    <header className="relative flex min-h-[calc(100vh-72px)] flex-col items-center justify-center px-6 pb-12 pt-16 text-center">
      <div className="relative z-10 w-full max-w-3xl">
        <h1 className="glitch-header cursor-default text-5xl font-semibold leading-[0.95] tracking-tight text-content-primary md:text-7xl">
          OPTIONS MADE
          <span className="text-accent-primary"> RIGHT</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-sm font-semibold text-content-secondary md:text-base">
          Earn upfront yield with up to 180% APY. <br />
          Trustless settlement with zero liquidation risk.
        </p>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <AppButtonLink href="#whitelist" variant="primary" className="w-full sm:w-auto">
            Join Whitelist
          </AppButtonLink>
          <AppButton variant="secondary" className="w-full sm:w-auto" type="button">
            Read Docs
          </AppButton>
        </div>
      </div>
    </header>
  );
}
