/**
 * Hero background — uses pre-composited bg_3 exported from Figma API.
 * Single image, no browser compositing artifacts.
 */
export function HeroBg() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[457px] overflow-hidden" aria-hidden="true">
      {/* bg_3: flattened onto black, 50% opacity to match Figma layer */}
      <div
        className="absolute inset-x-0 top-0 h-[810px] opacity-50"
        style={{
          backgroundImage: "url(/bg-hero.jpg)",
          backgroundSize: "1440px 810px",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center top"
        }}
      />

      {/* Gradient overlay: transparent at 37% → #121212 */}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(18,18,18,0) 37.1%, #121212 100%)" }}
      />
    </div>
  );
}
