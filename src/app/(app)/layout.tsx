import { AppNav } from "@/components/app-nav";
import { HeroBg } from "@/components/hero-bg";
import { SolanaWalletProvider } from "@/components/solana/solana-wallet-provider";
import { WalletSidebarProvider } from "@/components/wallet/wallet-sidebar";
import { RfqProvider } from "@/components/rfq/rfq-provider";
import { Footer } from "@/components/sections/footer";
import { ClarityProvider } from "@/components/clarity-provider";
import { ToastProvider } from "@/components/app-ui/toast";
import { SignInOnboarding } from "@/components/onboarding/sign-in-onboarding";
import { AppQueryProvider } from "@/components/state/app-query-provider";
import { RestoreWalletData } from "@/components/state/restore-wallet-data";
import { UnfinishedTradeNotice } from "@/components/state/unfinished-trade-notice";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppQueryProvider>
    <SolanaWalletProvider>
      <ClarityProvider />
      <RestoreWalletData />
      <WalletSidebarProvider>
        <ToastProvider>
          <RfqProvider>
            <div className="app-type relative flex min-h-screen flex-col bg-bg-primary text-content-primary">
              <HeroBg />
              <AppNav />
              <UnfinishedTradeNotice />
              <main className="relative z-[1] flex-1">{children}</main>
              <Footer />
            </div>
            <SignInOnboarding />
          </RfqProvider>
        </ToastProvider>
      </WalletSidebarProvider>
    </SolanaWalletProvider>
    </AppQueryProvider>
  );
}
