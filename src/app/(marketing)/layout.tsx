import { RouteTheme } from "@/components/route-theme";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen app-bg text-black dark:text-white">
      <RouteTheme theme="dark" />
      {children}
    </div>
  );
}


