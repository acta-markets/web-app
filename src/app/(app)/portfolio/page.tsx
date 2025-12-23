import { AppCard } from "@/components/app-ui/app-card";

export default function PortfolioPage() {
  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Portfolio</h1>

      <AppCard className="mt-8 p-6">
        <div className="text-sm font-semibold text-black/70 dark:text-white/70">Positions</div>
        <div className="mt-2 text-sm text-black/60 dark:text-white/60">
          Coming next: open positions, pending settlements, and realized yield.
        </div>
      </AppCard>
    </div>
  );
}


