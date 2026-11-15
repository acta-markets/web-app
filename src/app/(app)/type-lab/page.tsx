import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Type lab — mono candidates",
};

const FACES = [
  { id: "current", label: "JetBrains Mono (current)", stack: "'JetBrains Mono', ui-monospace, monospace" },
  { id: "plex", label: "IBM Plex Mono", stack: "'IBM Plex Mono', ui-monospace, monospace" },
  { id: "geist", label: "Geist Mono", stack: "'Geist Mono', ui-monospace, monospace" },
  { id: "scp", label: "Source Code Pro", stack: "'Source Code Pro', ui-monospace, monospace" },
];

const SIZES = [12, 14, 16];
const WEIGHTS = [400, 500];

function Sample({ stack, size, weight }: { stack: string; size: number; weight: number }) {
  return (
    <div style={{ fontFamily: stack, fontSize: size, fontWeight: weight, lineHeight: 1.45, letterSpacing: "-0.01em" }}>
      <div style={{ color: "#8A8A8A", letterSpacing: "0.08em", textTransform: "uppercase" as const }}>
        You pay premium
      </div>
      <div style={{ color: "#F0F0F0", fontVariantNumeric: "tabular-nums" }}>
        ≈ $114.46 &nbsp;·&nbsp; +3.4% &nbsp;·&nbsp; $63,570
      </div>
      <div style={{ color: "#8A8A8A" }}>
        BTC has to rise 1.7% in 5 days for you to be right
      </div>
    </div>
  );
}

export default function TypeLab() {
  return (
    <div className="min-h-screen bg-bg-primary px-6 py-10 text-content-primary">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=IBM+Plex+Mono:wght@400;500&family=Geist+Mono:wght@400;500&family=Source+Code+Pro:wght@400;500&display=swap"
      />
      <h1 className="font-space text-2xl font-semibold">Type lab — mono candidates</h1>
      <p className="mt-2 max-w-2xl font-mono text-[12px] leading-[1.5] text-content-secondary">
        Same content, same sizes, same canvas. Current site is the first column. Compare the label
        line inside and the numbers: the point is whether twelve pixels still reads as a label at
        four hundred instead of five.
      </p>

      {SIZES.map((size) => (
        <section key={size} className="mt-10">
          <h2 className="font-mono text-[12px] text-content-tertiary">
            {size}px
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {FACES.map((face) => (
              <div key={face.id} className="border border-bg-border p-4">
                <div className="mb-3 font-mono text-[12px] text-content-secondary">
                  {face.label}
                </div>
                <div className="space-y-4">
                  {WEIGHTS.map((weight) => (
                    <div key={weight}>
                      <div className="mb-1 font-mono text-[10px] text-content-tertiary">
                        {weight}
                      </div>
                      <Sample stack={face.stack} size={size} weight={weight} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
