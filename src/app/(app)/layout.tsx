import { AppNav } from "@/components/app-nav";
import { RouteTheme } from "@/components/route-theme";
import { PrivyAppProvider } from "@/components/privy/privy-app-provider";
import { Footer } from "@/components/sections/footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAppProvider>
      <div className="flex min-h-screen flex-col app-bg text-content-primary">
        <RouteTheme theme="dark" />
        <AppNav />
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>
        <Footer />
      </div>
    </PrivyAppProvider>
  );
}
