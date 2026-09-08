type Track = {
  glyph: string;
  title: string;
  copy: string;
  bg: string;
  accent: string;
  offset: [number, number];
};

const TRACKS: Track[] = [
  {
    glyph: "≈",
    title: "Trading desks",
    copy: "Quote the other side. Vault cycles reach connected desks over the RFQ WebSocket, priced and filled on Solana, settled in USDC",
    bg: "#072C28",
    accent: "#2AA286",
    offset: [0, 0],
  },
  {
    glyph: "◧",
    title: "Apps and wallets",
    copy: "Give your users yield on what they already hold. Route idle balances into curated vaults and keep your own front end",
    bg: "#2C0C23",
    accent: "#FF60BD",
    offset: [30, 20],
  },
  {
    glyph: "▣",
    title: "Treasuries",
    copy: "Put a token treasury to work without selling it. Covered calls and cash-secured puts on the assets you already hold",
    bg: "#2A1A00",
    accent: "#FF8A3C",
    offset: [60, 40],
  },
];

export function LandingPartnersTracks() {
  return (
    <section className="py-[120px] max-md:py-20">
      <div className="mx-auto w-full max-w-[850px] max-xl:px-[71px] max-lg:px-6 max-md:px-3">
        <h2
          className="mb-12 font-space font-semibold text-content-primary"
          style={{
            fontSize: "clamp(44px, 7vw, 80px)",
            lineHeight: 0.95,
            letterSpacing: "-0.03em",
          }}
        >
          Three ways in
        </h2>
        <div className="grid grid-cols-1 gap-0">
          {TRACKS.map((track, i) => (
            <div
              key={track.title}
              className={`grid items-stretch max-md:grid-cols-1 md:grid-cols-[140px_1fr] ${i === 0 ? "border-t border-bg-border" : ""
                } border-b border-bg-border`}
            >
              {/* tinted ASCII glyph */}
              <div
                className="relative overflow-hidden max-md:h-[140px] md:min-h-[180px]"
                style={{ backgroundColor: track.bg }}
              >
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    backgroundImage: "url(/landing/ascii-mountain.png)",
                    backgroundSize: "180% 180%",
                    backgroundPosition: `${track.offset[0]}% ${track.offset[1]}%`,
                    mixBlendMode: "color-dodge",
                    opacity: 0.9,
                  }}
                />
                <div
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center font-space font-bold"
                  style={{
                    fontSize: 96,
                    color: track.accent,
                    letterSpacing: "-0.05em",
                    lineHeight: 1,
                    mixBlendMode: "screen",
                  }}
                >
                  {track.glyph}
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
                  {track.title}
                </div>
                <div
                  className="max-w-[620px] font-mono text-content-secondary"
                  style={{
                    fontSize: 16,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.55,
                  }}
                >
                  {track.copy}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
