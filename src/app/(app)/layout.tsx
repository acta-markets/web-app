import { AppNav } from "@/components/app-nav";
import { RouteTheme } from "@/components/route-theme";
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
          <div className="flex min-h-screen flex-col app-bg text-content-primary">
            <RouteTheme theme="dark" />
            <AppNav />
            <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>
            <Footer />
          </div>
        </RfqProvider>
      </WalletSidebarProvider>
    </SolanaWalletProvider>
  );
}
