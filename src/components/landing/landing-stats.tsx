const STATS: Array<{ label: string; value: string; sub: string }> = [
  { label: "APR range", value: "8% – 41%", sub: "across 12 markets" },
  { label: "Premium paid", value: "$1.2M", sub: "last 30 days" },
  { label: "Total volume", value: "$48.3M", sub: "all-time, on-chain" },
];

export function LandingStats() {
  return (
    <section className="border-y border-bg-border">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 sm:grid-cols-3">
        {STATS.map((stat, i) => (
          <div
            key={stat.label}
            className={`px-7 py-8 max-md:px-5 max-md:py-6 ${
              i > 0
                ? "border-t border-bg-border sm:border-l sm:border-t-0"
                : ""
            }`}
          >
            <div
              className="mb-3.5 font-mono text-[11px] uppercase text-accent-secondary"
              style={{ letterSpacing: "0.08em" }}
            >
              <span
                className="mr-2 inline-block h-1.5 w-1.5 align-middle"
                style={{ background: "#80C9B6" }}
              />
              {stat.label}
            </div>
            <div
              className="font-space font-medium text-content-primary"
              style={{
                fontSize: "clamp(40px, 6vw, 54px)",
                lineHeight: 0.95,
                letterSpacing: "-0.03em",
              }}
            >
              {stat.value}
            </div>
            <div
              className="mt-2.5 font-mono text-[13px] text-content-secondary"
              style={{ letterSpacing: "-0.02em" }}
            >
              {stat.sub}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
