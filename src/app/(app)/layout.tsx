import { AppNav } from "@/components/app-nav";
import { RouteTheme } from "@/components/route-theme";
import { PrivyAppProvider } from "@/components/privy/privy-app-provider";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PrivyAppProvider>
      <div className="min-h-screen app-bg text-black dark:text-white">
        <RouteTheme theme="dark" />
        <AppNav />
        <main className="mx-auto w-full max-w-7xl px-6 py-10">{children}</main>
      </div>
    </PrivyAppProvider>
  );
}


