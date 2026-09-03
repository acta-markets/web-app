import {
  aprLegs,
  LANDING_VAULTS,
  totalApr,
  type LandingVault,
  type VaultStatus,
} from "@/lib/landing-vaults";
import { LandingBar, LandingButton, SectionMarker } from "./landing-primitives";

const STATUS_LABEL: Record<VaultStatus, string> = {
  live: "Live",
  soon: "Next",
  launch: "Open",
};

function StatusBadge({ status }: { status: VaultStatus }) {
  return (
    <span
      className="inline-flex items-center gap-[8px] font-mono text-[11px] uppercase text-content-secondary"
      style={{ letterSpacing: "0.12em" }}
    >
      {status === "live" && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: "#2AA286", boxShadow: "0 0 10px #2AA286" }}
        />
      )}
      {STATUS_LABEL[status]}
    </span>
  );
}

function VaultCta({ vault }: { vault: LandingVault }) {
  if (vault.status === "soon") {
    // non-interactive: there is nothing to click yet
    return (
      <div
        className="font-mono text-sm font-medium text-content-tertiary"
        style={{ letterSpacing: "-0.02em" }}
      >
        {vault.ctaLabel}
      </div>
    );
  }

  const isExternal = vault.ctaHref.startsWith("http");

  return (
    <LandingButton
      variant={vault.status === "live" ? "primary" : "ghost"}
      size="md"
      href={vault.ctaHref}
      external={isExternal}
    >
      {vault.ctaLabel}
    </LandingButton>
  );
}

function VaultCard({ vault }: { vault: LandingVault }) {
  const total = totalApr(vault);

  return (
    <div
      className={`flex h-full flex-col justify-between gap-8 p-7 max-md:p-5 ${
        vault.status === "soon" ? "opacity-[0.55]" : ""
      }`}
    >
      <div>
        <div className="mb-5 flex items-center justify-between gap-3">
          <span
            className="font-mono text-[11px] uppercase text-content-secondary"
            style={{ letterSpacing: "0.12em" }}
          >
            {vault.ticker}
          </span>
          <StatusBadge status={vault.status} />
        </div>

        <div
          className="font-space font-medium text-content-primary"
          style={{
            fontSize: "clamp(32px, 3.4vw, 40px)",
            lineHeight: 1,
            letterSpacing: "-0.03em",
          }}
        >
          {vault.asset}
        </div>

        <div className="mt-7">
          {vault.apr && total ? (
            <>
              <div
                className="font-space font-medium text-content-primary"
                style={{
                  fontSize: "clamp(40px, 6vw, 54px)",
                  lineHeight: 0.95,
                  letterSpacing: "-0.03em",
                }}
              >
                ~{total}%
              </div>
              <div
                className="mt-2.5 font-mono text-[13px] text-content-secondary"
                style={{ letterSpacing: "-0.02em" }}
              >
                {aprLegs(vault)}
              </div>

              <div className="mt-6 flex flex-col gap-4">
                {vault.apr.staking > 0 && (
                  <LandingBar
                    value={vault.apr.staking}
                    max={total}
                    color="#2AA286"
                    caption={`Staking ~${vault.apr.staking}%`}
                  />
                )}
                {vault.apr.premium > 0 && (
                  <LandingBar
                    value={vault.apr.premium}
                    max={total}
                    color="#80C9B6"
                    caption={`Desk premium ~${vault.apr.premium}%`}
                  />
                )}
              </div>

              {vault.riskNote && (
                <div
                  className="mt-5 font-mono text-[12px] text-content-tertiary"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {vault.riskNote}
                </div>
              )}
              {vault.note && (
                <div
                  className="mt-2 font-mono text-[12px] text-content-secondary"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  {vault.note}
                </div>
              )}
            </>
          ) : (
            <div
              className="font-mono text-[13px] text-content-secondary"
              style={{ letterSpacing: "-0.02em" }}
            >
              {vault.status === "launch"
                ? "Your asset, your users, your validator."
                : "Quoting soon"}
            </div>
          )}
        </div>
      </div>

      <div>
        <VaultCta vault={vault} />
        <div
          className="mt-5 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12px] text-content-secondary"
          style={{ letterSpacing: "-0.02em" }}
        >
          <span>Curator: {vault.curator}</span>
          <span>Cycle: {vault.cycle}</span>
        </div>
      </div>
    </div>
  );
}

export function LandingVaults() {
  return (
    <section
      id="vaults"
      className="scroll-mt-[88px] py-[120px] max-md:scroll-mt-[76px] max-md:py-20"
    >
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// Vaults" />
        <h2
          className="mb-12 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Pick a vault.
        </h2>

        {/* auto-rows-fr keeps every card the same height across both rows */}
        <div className="grid auto-rows-fr grid-cols-1 border-t border-bg-border md:grid-cols-2">
          {LANDING_VAULTS.map((vault, i) => (
            <div
              key={vault.id}
              className={`border-b border-bg-border ${
                i % 2 !== 0 ? "md:border-l" : ""
              }`}
            >
              <VaultCard vault={vault} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
