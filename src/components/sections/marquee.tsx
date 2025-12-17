const TEXT =
  "NO MARGIN ENGINE • NO LIQUIDATIONS • ISOLATED POSITIONS • 180% APY ON VOLATILITY • ";

export function Marquee() {
  return (
    <div className="overflow-hidden border-y-4 border-black bg-yuzu-accent py-4 text-3xl font-black uppercase text-white">
      <div className="marquee-container">
        <div className="marquee-content">{TEXT.repeat(8)}</div>
      </div>
    </div>
  );
}


