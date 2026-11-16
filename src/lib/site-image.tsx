import { ImageResponse } from "next/og";
import { BRAND_FG } from "@/lib/brand";
import { IS_MAINNET } from "@/lib/network";
import { DEVNET_TAG } from "@/lib/share/card";
import { FOOTER_HEIGHT, PAD, QUIET, SHARE_FONT_DISPLAY, cardFrame, monoStyle } from "@/lib/share/card-image";
import { shareCardFonts } from "@/lib/share/server-assets";
import { SITE_IMAGES, SITE_IMAGE_SIZE, type Headline, type HeadlineSlot, type SiteImageName } from "@/lib/site-images";
import { siteOrigin } from "@/lib/site-metadata";

/**
 * The picture a link to one of the site's pages gets in a post or a chat. Drawn in the share
 * card's frame, so the two read as one family, and tagged "Devnet" by the same rule: the
 * build's own network decides it.
 */

const HEADLINE_TOP = 168;
const INNER = SITE_IMAGE_SIZE.width - PAD * 2;

/** Size of a plain headline by its longest line: about 28 characters of the display face fill a line at 76px. */
function headlineSize(text: string): number {
  return Math.max(...text.split("\n").map((line) => line.length)) <= 28 ? 76 : 64;
}

function headlineElement(headline: Headline) {
  if (typeof headline === "string") {
    const size = headlineSize(headline);
    // a line break in the words is kept, so a headline can be split where it reads best
    return (
      <div style={{ display: "flex", flexDirection: "column", fontFamily: SHARE_FONT_DISPLAY, fontWeight: 600, fontSize: size, letterSpacing: size * -0.03, lineHeight: 1.1 }}>
        {headline.split("\n").map((text) => (
          <div key={text} style={{ display: "flex" }}>
            {text}
          </div>
        ))}
      </div>
    );
  }
  // a sentence with blanks: each word and each blank is its own piece, so the line wraps between them
  const size = 64;
  const rowHeight = 84;
  const pieces = headline.flatMap((part): Array<string | HeadlineSlot> => (typeof part === "string" ? part.split(" ").filter(Boolean) : [part]));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", fontFamily: SHARE_FONT_DISPLAY, fontWeight: 600, fontSize: size, letterSpacing: size * -0.03, lineHeight: 1 }}>
      {pieces.map((piece, i) =>
        typeof piece === "string" ? (
          <div key={i} style={{ display: "flex", alignItems: "center", height: rowHeight, marginRight: 18, marginBottom: 14 }}>
            {piece}
          </div>
        ) : (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              height: rowHeight,
              marginRight: 18,
              marginBottom: 14,
              padding: "0 22px",
              border: `2px dashed ${QUIET}`,
              color: QUIET,
            }}
          >
            {piece.slot}
          </div>
        ),
      )}
    </div>
  );
}

/** One of the site's link-preview pictures: a headline and one quiet line under it. */
export async function siteImage(name: SiteImageName): Promise<ImageResponse> {
  const { headline, line }: { headline: Headline; line: string } = SITE_IMAGES[name];
  const fonts = await shareCardFonts();
  return new ImageResponse(
    cardFrame({
      ...SITE_IMAGE_SIZE,
      scale: 1,
      tag: IS_MAINNET ? null : DEVNET_TAG,
      footer: { left: new URL(siteOrigin()).host, right: "" },
      children: [
        <div
          key="body"
          style={{
            position: "absolute",
            left: PAD,
            top: HEADLINE_TOP,
            width: INNER,
            maxHeight: SITE_IMAGE_SIZE.height - FOOTER_HEIGHT - HEADLINE_TOP - 24,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            color: BRAND_FG,
          }}
        >
          {headlineElement(headline)}
          <div style={{ display: "flex", marginTop: typeof headline === "string" ? 28 : 14, color: QUIET, ...monoStyle(1, 28, 400), lineHeight: 1.4 }}>{line}</div>
        </div>,
      ],
    }),
    { ...SITE_IMAGE_SIZE, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
