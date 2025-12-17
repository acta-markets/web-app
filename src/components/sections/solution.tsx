import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";

export function Solution() {
  return (
    <section
      id="solution"
      className="relative overflow-hidden border-y-4 border-yuzu-main bg-black py-24 text-yuzu-main"
    >
      <Container className="relative z-10">
        <div className="grid items-center gap-16 md:grid-cols-2">
          <div>
            <h2 className="mb-8 text-5xl font-black leading-none md:text-7xl">
              THE VOLATILITY <br /> LAYER
            </h2>
            <ul className="space-y-6 font-mono text-xl text-white">
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
            <div className="absolute inset-0 translate-x-4 translate-y-4 border-4 border-white bg-yuzu-accent" />
            <Card
              hoverNeo={false}
              className="relative bg-white p-8 text-black shadow-neo transition-transform group-hover:translate-x-1 group-hover:translate-y-1"
            >
              <h3 className="mb-4 border-b-4 border-black pb-2 text-3xl font-black">
                YIELD GENERATOR
              </h3>
              <p className="mb-4 font-bold">Turn idle assets into yield beasts.</p>
              <div className="mb-2 flex items-end justify-between border-2 border-black bg-off-white p-4">
                <span>jitoSOL Base</span>
                <span className="font-bold text-gray-500">~8% APY</span>
              </div>
              <div className="my-2 flex justify-center text-4xl font-black">⬇</div>
              <div className="flex items-end justify-between border-4 border-black bg-yuzu-main p-4">
                <span className="font-black">YUZU jitoSOL</span>
                <span className="text-3xl font-black">UP TO 180% APY</span>
              </div>
            </Card>
          </div>
        </div>
      </Container>
    </section>
  );
}


