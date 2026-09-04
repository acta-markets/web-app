import { SectionMarker } from "./landing-primitives";

type Step = {
  n: string;
  title: string;
  copy: string;
  bg: string;
  accent: string;
  offset: [number, number];
  joke?: boolean;
};

const STEPS: Step[] = [
  {
    n: "01",
    title: "Deposit",
    copy: "Pick a curated vault and deposit the asset you already hold",
    bg: "#072C28",
    accent: "#2AA286",
    offset: [0, 0],
  },
  {
    n: "02",
    title: "Get paid",
    copy: "Cash arrives upfront, every week, in USDC",
    bg: "#2C0C23",
    accent: "#FF60BD",
    offset: [30, 20],
  },
  {
    // the punchline: there is no step three
    n: "03",
    title: "Oh wait",
    copy: "Withdraw at the end of any cycle. There is no step three.",
    bg: "#2A1A00",
    accent: "#FF8A3C",
    offset: [60, 40],
    joke: true,
  },
];

export function LandingHowItWorks() {
  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <SectionMarker label="// How it works" />
        <h2
          className="mb-12 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Three steps
        </h2>
        <div className="grid grid-cols-1 gap-0">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className={`grid items-stretch max-md:grid-cols-1 md:grid-cols-[140px_1fr] ${i === 0 ? "border-t border-bg-border" : ""
                } border-b border-bg-border`}
            >
              {/* tinted ASCII numeral */}
              <div
                className="relative overflow-hidden max-md:h-[140px] md:min-h-[180px]"
                style={{ backgroundColor: step.bg }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage: "url(/landing/ascii-mountain.png)",
                    backgroundSize: "180% 180%",
                    backgroundPosition: `${step.offset[0]}% ${step.offset[1]}%`,
                    mixBlendMode: "color-dodge",
                    opacity: 0.9,
                  }}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center font-space font-bold"
                  style={{
                    fontSize: 96,
                    color: step.accent,
                    letterSpacing: "-0.05em",
                    lineHeight: 1,
                    mixBlendMode: "screen",
                    opacity: step.joke ? 0.4 : 1,
                  }}
                >
                  {step.n}
                </div>
              </div>
              <div className="flex flex-col justify-center px-12 py-10 max-md:px-5 max-md:py-8">
                <div
                  className="mb-3.5 font-space font-semibold text-content-primary"
                  style={{
                    fontSize: "clamp(32px, 4vw, 44px)",
                    lineHeight: 1,
                    letterSpacing: "-0.03em",
                  }}
                >
                  {step.joke ? (
                    <span className="italic text-content-secondary">{step.title}</span>
                  ) : (
                    <>{step.title}</>
                  )}
                </div>
                <div
                  className="max-w-[620px] font-mono text-content-secondary"
                  style={{
                    fontSize: 16,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.55,
                  }}
                >
                  {step.copy}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div
          className="mt-6 font-mono text-content-secondary"
          style={{ fontSize: 14, letterSpacing: "-0.02em" }}
        >
          Want to set your own targets?{" "}
          <a
            href="/earn"
            className="text-accent-secondary transition-colors hover:text-content-primary"
          >
            Pro ↗
          </a>
        </div>
      </div>
    </section>
  );
}
