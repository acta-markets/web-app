export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen app-bg text-content-primary">
      {children}
    </div>
  );
}
