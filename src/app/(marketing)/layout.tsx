import { RouteTheme } from "@/components/route-theme";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen yuzu-dots">
      <RouteTheme theme="light" />
      {children}
    </div>
  );
}


