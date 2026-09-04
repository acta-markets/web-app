import { ImageResponse } from "next/og";
import { BRAND_BG, logomarkDataUri } from "@/lib/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_BG
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logomarkDataUri(112)} width={112} height={112} alt="" />
      </div>
    ),
    size
  );
}
