type Spec = {
  label: string;
  value: string;
  copy: string;
};

const SPECS: Spec[] = [
  {
    label: "Connectivity",
    value: "RFQ over WebSocket",
    copy: "Connect with @acta-markets/ts-sdk. Stream anonymously, then authenticate by signing a human-readable challenge with your wallet",
  },
  {
    label: "Network",
    value: "Solana mainnet",
    copy: "Live today. Premiums are paid and settled in USDC",
  },
  {
    label: "Risk",
    value: "No liquidations",
    copy: "Vaults are fully collateralised. Positions are never margined, so there is nothing to liquidate",
  },
  {
    label: "Instruments",
    value: "Calls and cash-secured puts",
    copy: "Curated per asset and per cycle, with defined strikes and sizes rather than an open order book",
  },
];

export function LandingPartnersStack() {
  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          What you
          <br />
          plug into
        </h2>

        <p
          className="mb-12 max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          One venue, one integration. The same infrastructure that prices the vaults on
          this site
        </p>

        <dl className="grid grid-cols-2 gap-px border border-bg-border max-md:grid-cols-1" style={{ background: "#282828" }}>
          {SPECS.map((spec) => (
            <div
              key={spec.label}
              className="flex flex-col px-8 py-8 max-md:px-5 max-md:py-6"
              style={{ background: "#121212" }}
            >
              <dt
                className="mb-3 font-mono text-[12px] uppercase text-content-secondary"
                style={{ letterSpacing: "0.18em" }}
              >
                {spec.label}
              </dt>
              <dd className="m-0">
                <div
                  className="mb-2.5 font-space font-semibold text-content-primary"
                  style={{
                    fontSize: 22,
                    lineHeight: 1.15,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {spec.value}
                </div>
                <div
                  className="font-mono text-content-secondary"
                  style={{
                    fontSize: 14,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.55,
                  }}
                >
                  {spec.copy}
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
