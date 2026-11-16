import type { ShareCard } from "./card";
import { shareImagePath } from "./params";

export { SHARE_CARD_SIZE } from "./card";

/**
 * A share card as a PNG. The server draws it (`/share/card`), from the same address a post's
 * link preview loads, so what the user sees, saves and posts is one picture. This fetches the
 * sharp version, twice the preview's size.
 */
export async function renderShareCard(card: ShareCard): Promise<Blob> {
  const res = await fetch(shareImagePath(card, 2));
  if (!res.ok) throw new Error(`The image could not be made (${res.status})`);
  return res.blob();
}
