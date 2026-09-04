import {
  aprLegs,
  LANDING_VAULTS,
  totalApr,
  type LandingVault,
} from "@/lib/landing-vaults";
import { LandingBar, LandingButton, SectionMarker } from "./landing-primitives";

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
      className={`flex h-full min-h-[520px] flex-col justify-between gap-8 p-7 max-md:min-h-[440px] max-md:p-5 ${
        vault.status === "soon" ? "opacity-[0.55]" : ""
      }`}
    >
      <div>
        <div
          className="mb-5 font-mono text-[11px] uppercase text-content-secondary"
          style={{ letterSpacing: "0.12em" }}
        >
          {vault.type}
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

              {/* riskNote and note are held in the data, not shown on the card yet */}
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
          Pick a vault
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
