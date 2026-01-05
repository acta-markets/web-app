import { RouteTheme } from "@/components/route-theme";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen app-bg text-content-primary">
      <RouteTheme theme="dark" />
      {children}
    </div>
  );
}
