import { Container } from "@/components/ui/container";
import { AppCard } from "@/components/app-ui/app-card";

export function Solution() {
  return (
    <section
      id="solution"
      className="relative overflow-hidden border-y border-white/10 bg-black/30 py-24 text-yuzu-main"
    >
      <Container className="relative z-10">
        <div className="grid items-center gap-16 md:grid-cols-2">
          <div>
            <h2 className="mb-8 text-4xl font-semibold leading-none tracking-tight text-white md:text-5xl">
              THE VOLATILITY <br /> LAYER
            </h2>
            <ul className="space-y-6 text-white/80">
              <li className="flex items-start gap-4">
                <span className="text-3xl text-yuzu-main">➤</span>
                <div>
                  <strong className="bg-white/10 px-2 text-yuzu-main">
                    OFF-CHAIN QUOTES
                  </strong>
                  <p className="mt-1 text-sm opacity-80">
                    Institutional workflow via RFQ. Fast, familiar.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-3xl text-yuzu-main">➤</span>
                <div>
                  <strong className="bg-white/10 px-2 text-yuzu-main">
                    ON-CHAIN SETTLEMENT
                  </strong>
                  <p className="mt-1 text-sm opacity-80">
                    Atomic, trustless settlement. Transaction recorder only.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-3xl text-yuzu-main">➤</span>
                <div>
                  <strong className="bg-white/10 px-2 text-yuzu-main">ZERO RISK</strong>
                  <p className="mt-1 text-sm opacity-80">
                    Fully collateralized. Each trade in its own vault.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="group relative">
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-yuzu-main/10 blur-2xl" />
            <AppCard className="relative border-white/10 bg-white/5 p-8">
              <h3 className="mb-4 border-b border-white/10 pb-3 text-xl font-semibold text-white">
                YIELD GENERATOR
              </h3>
              <p className="mb-4 text-sm font-semibold text-white/70">
                Turn idle assets into yield beasts.
              </p>
              <div className="mb-2 flex items-end justify-between rounded-xl border border-white/10 bg-black/20 p-4 text-white/80">
                <span>jitoSOL Base</span>
                <span className="font-semibold text-white/60">~8% APY</span>
              </div>
              <div className="my-2 flex justify-center text-2xl font-semibold text-white/40">↓</div>
              <div className="flex items-end justify-between rounded-xl border border-yuzu-main/40 bg-yuzu-main/15 p-4 text-white">
                <span className="font-semibold">ACTA jitoSOL</span>
                <span className="text-xl font-semibold">UP TO 180% APY</span>
              </div>
            </AppCard>
          </div>
        </div>
      </Container>
    </section>
  );
}


