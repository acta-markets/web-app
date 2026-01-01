const TEXT =
  "NO MARGIN ENGINE • NO LIQUIDATIONS • ISOLATED POSITIONS • 180% APY ON VOLATILITY • ";

export function Marquee() {
  return (
    <div className="overflow-hidden border-y border-white/10 bg-black/30 py-4 text-2xl font-semibold uppercase text-yuzu-main">
      <div className="marquee-container">
        <div className="marquee-content">{TEXT.repeat(8)}</div>
      </div>
    </div>
  );
}


