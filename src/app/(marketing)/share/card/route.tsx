import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { IS_MAINNET } from "@/lib/network";
import { DEVNET_TAG } from "@/lib/share/card";
import { SHARE_CARD_SIZE, shareCardElement } from "@/lib/share/card-image";
import { decodeShareCard } from "@/lib/share/params";
import { publicImage, shareCardCacheControl, shareCardFonts } from "@/lib/share/server-assets";
import { getTokenLogo } from "@/lib/tokens";

export const runtime = "nodejs";

/**
 * A share card as a PNG, drawn from the card in the address (`c`). `s=2` draws it at twice
 * the size, for saving. The same image is the app's preview, the file a user saves and the
 * picture a post's link unfurls, so the three cannot differ.
 *
 * It lives outside `/api` on purpose: robots.txt closes `/api/` to crawlers, and the crawler
 * that builds a post's preview has to be able to load this.
 */
export async function GET(req: NextRequest) {
  // the tag is this deployment's own network, never the link's word for it
  const card = decodeShareCard(req.nextUrl.searchParams.get("c"), { tag: IS_MAINNET ? null : DEVNET_TAG });
  if (!card) return new Response("Not a share card", { status: 400 });
  const scale = req.nextUrl.searchParams.get("s") === "2" ? 2 : 1;
  const origin = req.nextUrl.origin;
  const logoPath = card.asset ? getTokenLogo(card.asset) : "";

  const [fonts, tokenLogo] = await Promise.all([shareCardFonts(), logoPath ? publicImage(origin, logoPath) : Promise.resolve(null)]);

  return new ImageResponse(shareCardElement(card, { host: req.headers.get("host") ?? req.nextUrl.host, tokenLogo, scale }), {
    width: SHARE_CARD_SIZE.width * scale,
    height: SHARE_CARD_SIZE.height * scale,
    fonts: fonts.length > 0 ? fonts : undefined,
    // The header's name is written in lower case on purpose: `ImageResponse` spreads these over
    // its own lower-case "cache-control" (a year, immutable). Under any other spelling both
    // survive and are joined, and a card drawn in the fallback face would be kept for a year.
    headers: { "cache-control": shareCardCacheControl(fonts.length) },
  });
}
