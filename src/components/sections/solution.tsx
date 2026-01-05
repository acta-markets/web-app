import { Container } from "@/components/ui/container";
import { AppCard } from "@/components/app-ui/app-card";

export function Solution() {
  return (
    <section
      id="solution"
      className="relative overflow-hidden bg-action-primary/30 py-24 text-accent-primary"
    >
      <Container className="relative z-10">
        <div className="grid items-center gap-16 md:grid-cols-2">
          <div>
            <h2 className="mb-8 text-4xl font-semibold leading-none tracking-tight text-content-primary md:text-5xl">
              THE VOLATILITY <br /> LAYER
            </h2>
            <ul className="space-y-6 text-content-secondary">
              <li className="flex items-start gap-4">
                <span className="text-3xl text-accent-primary">➤</span>
                <div>
                  <strong className="bg-action-primary/20 px-2 text-accent-primary">
                    OFF-CHAIN QUOTES
                  </strong>
                  <p className="mt-1 text-sm opacity-80">
                    Institutional workflow via RFQ. Fast, familiar.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-3xl text-accent-primary">➤</span>
                <div>
                  <strong className="bg-action-primary/20 px-2 text-accent-primary">
                    ON-CHAIN SETTLEMENT
                  </strong>
                  <p className="mt-1 text-sm opacity-80">
                    Atomic, trustless settlement. Transaction recorder only.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <span className="text-3xl text-accent-primary">➤</span>
                <div>
                  <strong className="bg-action-primary/20 px-2 text-accent-primary">ZERO RISK</strong>
                  <p className="mt-1 text-sm opacity-80">
                    Fully collateralized. Each trade in its own vault.
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <div className="group relative">
            <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-accent-primary/10 blur-2xl" />
            <AppCard className="relative border border-white/10 bg-white/5 p-8">
              <h3 className="mb-4 pb-3 text-xl font-semibold text-content-primary">
                YIELD GENERATOR
              </h3>
              <p className="mb-4 text-sm font-semibold text-content-secondary">
                Turn idle assets into yield beasts.
              </p>
              <div className="mb-2 flex items-end justify-between rounded-xl bg-action-secondary/40 p-4 text-content-secondary">
                <span>jitoSOL Base</span>
                <span className="font-semibold text-content-tertiary">~8% APY</span>
              </div>
              <div className="my-2 flex justify-center text-2xl font-semibold text-content-tertiary">↓</div>
              <div className="flex items-end justify-between rounded-xl border border-accent-primary/40 bg-accent-primary/15 p-4 text-content-primary">
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
