import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import type { ReactNode } from "react";

type Step = {
  number: string;
  label: string;
  title: string;
  body: ReactNode;
  tone?: "white" | "main";
  connector?: boolean;
};

const steps: Step[] = [
  {
    number: "01",
    label: "Input",
    title: "Deposit Collateral",
    tone: "white",
    connector: true,
    body: (
      <>
        <p className="mb-4 font-medium">
          Users deposit assets into isolated vaults. Supporting majors, LSTs, JLP
          and memecoins.
        </p>
        <ul className="space-y-2 border-t-2 border-dashed border-black pt-4 text-sm font-bold">
          <li>✓ No Liquidation Risk</li>
          <li>✓ Fully Collateralized</li>
        </ul>
      </>
    )
  },
  {
    number: "02",
    label: "Engine",
    title: "RFQ Settlement",
    tone: "main",
    connector: true,
    body: (
      <>
        <p className="mb-4 font-medium">
          Off-chain market makers provide institutional-grade liquidity via RFQ.
        </p>
        <p className="font-medium">
          Trades are settled atomically on-chain. This creates a deterministic
          snapshot per expiry without the manipulation window of AMMs.
        </p>
      </>
    )
  },
  {
    number: "03",
    label: "Output",
    title: "Harvest Yield",
    tone: "white",
    connector: false,
    body: (
      <>
        <p className="mb-4 font-medium">
          The protocol acts as a{" "}
          <span className="bg-yuzu-accent px-1 text-white">Volatility Layer</span>.
        </p>
        <p className="font-medium">
          Earn base staking yield (from LSTs) + Option Premiums on top. Total APY
          up to 180% depending on volatility conditions.
        </p>
      </>
    )
  }
];

export function Architecture() {
  return (
    <section id="how-it-works" className="px-4 py-24">
      <Container className="px-0 sm:px-6">
        <h2 className="mb-16 text-center text-5xl font-black uppercase md:text-7xl">
          The Yuzu <span className="bg-black px-2 text-white">Architecture</span>
        </h2>

        <div className="relative grid gap-12 md:grid-cols-3">
          {steps.map((s) => {
            const wrapperClass = s.connector
              ? "dashed-connector relative z-10"
              : "relative z-10";
            const cardBg =
              s.tone === "main"
                ? "bg-yuzu-main md:-translate-y-4"
                : "bg-white";
            const headerText = s.tone === "main" ? "text-white" : "text-yuzu-main";

            return (
              <div key={s.number} className={wrapperClass}>
                <Card className={`flex h-full flex-col ${cardBg}`}>
                  <div
                    className={`flex items-center justify-between border-b-4 border-black bg-black p-4 ${headerText}`}
                  >
                    <span className="text-4xl font-black">{s.number}</span>
                    <span className="font-bold uppercase tracking-widest">
                      {s.label}
                    </span>
                  </div>
                  <div className="flex-grow p-6">
                    <h3 className="mb-4 text-2xl font-bold uppercase">{s.title}</h3>
                    {s.body}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}


