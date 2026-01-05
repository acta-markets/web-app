const TEXT =
  "NO MARGIN ENGINE • NO LIQUIDATIONS • ISOLATED POSITIONS • 180% APY ON VOLATILITY • ";

export function Marquee() {
  return (
    <div className="overflow-hidden bg-action-primary/30 py-4 text-2xl font-semibold uppercase text-accent-primary">
      <div className="marquee-container">
        <div className="marquee-content">{TEXT.repeat(8)}</div>
      </div>
    </div>
  );
}
