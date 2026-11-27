/**
 * Hero background — uses pre-composited bg_3 exported from Figma API.
 * Single image, no browser compositing artifacts.
 *
 * The image is darker than the page, so wherever it stops the page shows beside it as a lighter
 * block. It is drawn at its own 1440px up to that width and grows with the window past it, so
 * it always reaches both edges.
 */
export function HeroBg() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[457px] overflow-hidden" aria-hidden="true">
      {                                                                  }
      <div
        className="absolute inset-x-0 top-0 h-[810px] opacity-50"
        style={{
          backgroundImage: "url(/bg-hero.jpg)",
          backgroundSize: "max(1440px, 100%) auto",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center top"
        }}
      />

      {                                                    }
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(to bottom, rgba(18,18,18,0) 37.1%, #121212 100%)" }}
      />
    </div>
  );
}
