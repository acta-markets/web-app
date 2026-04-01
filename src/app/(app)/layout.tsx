import { AppNav } from "@/components/app-nav";
import { HeroBg } from "@/components/hero-bg";
import { SolanaWalletProvider } from "@/components/solana/solana-wallet-provider";
import { WalletSidebarProvider } from "@/components/wallet/wallet-sidebar";
import { RfqProvider } from "@/components/rfq/rfq-provider";
import { Footer } from "@/components/sections/footer";
import { ClarityProvider } from "@/components/clarity-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SolanaWalletProvider>
      <ClarityProvider />
      <WalletSidebarProvider>
        <RfqProvider>
          <div className="relative flex min-h-screen flex-col bg-bg-primary text-content-primary">
            <HeroBg />
            <AppNav />
            <main className="relative z-[1] flex-1">{children}</main>
            <Footer />
          </div>
        </RfqProvider>
      </WalletSidebarProvider>
    </SolanaWalletProvider>
  );
}
