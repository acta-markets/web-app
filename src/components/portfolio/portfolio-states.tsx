import { AppCard } from "@/components/app-ui/app-card";
import { AppButtonLink } from "@/components/app-ui/app-button";
import { ConnectWalletAction } from "@/components/wallet/connect-wallet-action";
import { cn } from "@/lib/cn";

/** One block of a loading skeleton, the same block the trade page uses. */
const BONE = "animate-pulse bg-action-primary";

/** The performance card while its figures load: same card, same rows, same heights. */
export function PerformanceSkeleton() {
  return (
    <AppCard className="p-5" aria-hidden="true">
      <div className={cn(BONE, "h-[13px] w-16")} />
      <div className={cn(BONE, "mt-2 h-11 w-48 max-md:h-[35px]")} />
      <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-bg-border pt-5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className={cn(BONE, "h-4 w-16")} />
            <div className={cn(BONE, "h-[25px] w-24")} />
            <div className={cn(BONE, "h-4 w-20")} />
          </div>
        ))}
      </div>
    </AppCard>
  );
}

/** The positions list while it loads: a header line and three rows. */
export function PositionsSkeleton() {
  return (
    <div className="border border-bg-border" aria-hidden="true">
      <div className="border-b border-bg-border px-2.5 py-2.5">
        <div className={cn(BONE, "h-[13px] w-40")} />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center justify-between gap-6 border-b border-bg-border px-2.5 py-3 last:border-b-0">
          <div className={cn(BONE, "h-4 w-1/3")} />
          <div className={cn(BONE, "h-4 w-1/4")} />
        </div>
      ))}
    </div>
  );
}

/** Said once for the whole page while it loads, so the skeletons can stay silent. */
export function LoadingStatus() {
  return (
    <p role="status" className="sr-only">
      Loading your portfolio
    </p>
  );
}

/** A wallet that has never traded: one explanation and one way forward, not three empty boxes. */
export function PortfolioEmpty() {
  return (
    <AppCard className="flex flex-col items-center px-6 py-12 text-center">
      <p className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Nothing here yet</p>
      <p className="mt-2 max-w-md font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
        Your positions, the premium you collect and your P&L appear here after your first trade.
      </p>
      <AppButtonLink href="/trade" className="mt-6">
        Make your first trade
      </AppButtonLink>
    </AppCard>
  );
}

/** No wallet: the page says what it will show and asks for one the way Trade does, with one main action. */
export function PortfolioConnect() {
  return (
    <AppCard className="flex flex-col items-center px-6 py-12 text-center">
      <p className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Your positions show here</p>
      <p className="mt-2 max-w-md font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
        Connect a wallet to see its positions, income and P&L.
      </p>
      <ConnectWalletAction className="mt-6" />
    </AppCard>
  );
}

/** Connected, but the wallet has not approved the sign-in message that unlocks its positions. */
export function PortfolioSignIn() {
  return (
    <AppCard className="px-6 py-10 text-center">
      <p className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">Sign in to see your positions</p>
      <p className="mx-auto mt-2 max-w-md font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
        Approve the sign-in message in your wallet. It is a signature only: it costs nothing and moves no funds.
      </p>
    </AppCard>
  );
}
