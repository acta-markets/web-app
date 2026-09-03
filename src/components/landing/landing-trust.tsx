const ITEMS = [
  "Non-custodial",
  "Fully collateralized",
  "Settles on-chain",
  "No liquidations",
  // TODO(tim): confirm audit status wording
  "Audit in progress",
];

export function LandingTrust() {
  return (
    <section className="border-y border-bg-border">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 md:grid-cols-5">
        {ITEMS.map((item, i) => (
          <div
            key={item}
            className={`px-7 py-6 max-md:px-5 max-md:py-4 ${
              i > 0 ? "border-t border-bg-border md:border-l md:border-t-0" : ""
            }`}
          >
            <div
              className="font-mono text-[12px] uppercase text-content-secondary"
              style={{ letterSpacing: "0.08em" }}
            >
              <span
                className="mr-2 inline-block h-1.5 w-1.5 align-middle"
                style={{ background: "#80C9B6" }}
              />
              {item}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
