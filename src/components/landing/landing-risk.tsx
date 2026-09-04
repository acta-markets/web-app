import { SectionMarker } from "./landing-primitives";

type Risk = {
  title: string;
  copy: string;
  /** the one line in the list that is not a loss */
  ok?: boolean;
};

// NOTE: asset-specific exposure (USDC depeg, xTSLA issuer and redemption) is
// deliberately out of scope. The custody and redemption model is not settled, and a
// wrong risk disclosure is worse than a missing one. This list covers only what is
// common to every vault.
const RISKS: Risk[] = [
  {
    title: "The asset falls",
    copy: "You hold the asset, so you carry its price. If it drops, your position drops with it. The premium and the staking rewards cushion the fall, they do not stop it. This is the same risk you carry holding it in your own wallet, and it is the largest one on this page.",
  },
  {
    title: "Your upside caps",
    copy: "Roughly one week in twelve, the asset runs past the target and you keep the target price instead of the market price. You keep the premium and the staking rewards either way. What you give up is the gain above the target for that week. This is the trade, not a failure.",
  },
  {
    title: "The contracts fail",
    copy: "Non-custodial means nobody can move your deposit. It does not mean the code is free of bugs. Audit is in progress and the reports go in the docs when they are done. This is the risk that can take everything, and it is why public deposits stay gated until the audit lands.",
  },
  {
    title: "You cannot leave mid-cycle",
    copy: "Deposits and withdrawals process at cycle boundaries, so every position stays fully collateralized for the whole week. If you want out on a Wednesday, you wait for the cycle to close.",
  },
  {
    title: "The desk not paying",
    copy: "This one is not a risk. Premium arrives upfront, in USDC, before the week starts, so you are never chasing a payment. The collateral sits in the vault on-chain the whole time and settles on-chain at the end of each cycle.",
    ok: true,
  },
];

export function LandingRisk() {
  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Risk" color="#FF8A3C" />
        <h2
          className="mb-10 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          How you lose money
        </h2>

        <p
          className="mb-10 max-w-[620px] font-mono leading-[1.55] text-[#E8E8E8]"
          style={{ fontSize: 16, letterSpacing: "-0.02em" }}
        >
          Three questions get asked here and they are the same question. Where does the
          yield come from, how does it work, what is the risk. All of them mean: how do I
          lose money. Here is the whole list.
        </p>

        {/* visible list, never an accordion: hiding risk behind a click undercuts it */}
        <div className="border border-bg-border">
          {RISKS.map((risk, i) => (
            <div
              key={risk.title}
              className={`px-6 py-5 max-md:px-5 ${
                i < RISKS.length - 1 ? "border-b border-bg-border" : ""
              }`}
            >
              <div
                className={`mb-2 font-mono text-base font-medium ${
                  risk.ok ? "text-accent-secondary" : "text-content-primary"
                }`}
                style={{ letterSpacing: "-0.02em" }}
              >
                {risk.title}
              </div>
              <div
                className="max-w-[720px] font-mono text-sm text-content-secondary"
                style={{ letterSpacing: "-0.02em", lineHeight: 1.6 }}
              >
                {risk.copy}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
