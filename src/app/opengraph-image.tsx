import { ImageResponse } from "next/og";
import { BRAND_ACCENT, BRAND_BG, BRAND_FG, logomarkDataUri } from "@/lib/brand";

export const alt = "Acta — Hold and get paid more";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Note: satori (behind ImageResponse) requires an explicit `display: flex` on any
// element with more than one child, so every wrapper below sets it.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND_BG,
          color: BRAND_FG,
          padding: 80
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logomarkDataUri(72)} width={72} height={72} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, letterSpacing: "-0.03em" }}>Hold and</div>
          <div style={{ display: "flex", fontSize: 84, letterSpacing: "-0.03em" }}>
            <span>get paid</span>
            <span style={{ color: BRAND_ACCENT, marginLeft: 24 }}>more</span>
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: "#8A8A8A", maxWidth: 860 }}>
            Curated yield vaults for the assets you already hold. No liquidations.
          </div>
        </div>
      </div>
    ),
    size
  );
}
