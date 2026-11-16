/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";
import { BRAND_BG, logomarkDataUri } from "@/lib/brand";

/**
 * The site's icon as a PNG at a named size: the logomark on the brand's dark ground.
 *  - 16, 32, 48: the tab icon's sizes, with the rounded corner `icon.svg` has. `favicon.ico`
 *    is these three wrapped in one file (`scripts/make-favicon.mjs`).
 *  - 192, 512: the web manifest's icons, square to the edge.
 *  - 512-maskable: the same with a wide margin, for a launcher that cuts its own shape.
 * Any other name is not an icon.
 */
const ICONS: Record<string, { size: number; mark: number; rounded: boolean }> = {
  "16": { size: 16, mark: 0.6864, rounded: true },
  "32": { size: 32, mark: 0.6864, rounded: true },
  "48": { size: 48, mark: 0.6864, rounded: true },
  "192": { size: 192, mark: 0.62, rounded: false },
  "512": { size: 512, mark: 0.62, rounded: false },
  "512-maskable": { size: 512, mark: 0.5, rounded: false },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export function GET(_req: Request, { params }: { params: { size: string } }) {
  const icon = ICONS[params.size];
  if (!icon) return new Response("Not an icon", { status: 404 });
  const mark = Math.round(icon.size * icon.mark);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_BG,
          // icon.svg's corner: 7 of 32
          borderRadius: icon.rounded ? (icon.size * 7) / 32 : 0,
        }}
      >
        <img src={logomarkDataUri(mark * 4)} width={mark} height={mark} alt="" />
      </div>
    ),
    { width: icon.size, height: icon.size },
  );
}
