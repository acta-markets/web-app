import { SHARE_FONT_DISPLAY, SHARE_FONT_MONO } from "./card-image";

/**
 * What the server needs to draw a card besides the card: the two faces and a few images.
 * Each is fetched once per server instance and kept. A miss is not kept, so the next card
 * tries again, and a card is always drawn: without a face the built-in one is used, without
 * an image the card goes without it.
 */

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" };

// Google serves a plain TrueType file, which the renderer needs, only to a browser that asks for nothing newer.
const TTF_USER_AGENT =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";
const FETCH_TIMEOUT_MS = 8000;

const kept = new Map<string, Promise<ArrayBuffer | null>>();

function once(key: string, load: () => Promise<ArrayBuffer | null>): Promise<ArrayBuffer | null> {
  let pending = kept.get(key);
  if (!pending) {
    pending = load().catch(() => null);
    kept.set(key, pending);
    void pending.then((data) => {
      if (!data) kept.delete(key);
    });
  }
  return pending;
}

async function get(url: string, headers?: Record<string, string>): Promise<Response | null> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return res.ok ? res : null;
}

function googleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  return once(`font:${family}:${weight}`, async () => {
    const css = await get(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, { "User-Agent": TTF_USER_AGENT });
    const url = (await css?.text())?.match(/src:\s*url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)\s*format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return (await get(url))?.arrayBuffer() ?? null;
  });
}

/** How many faces a complete card has; fewer came back means some text is in the built-in face. */
export const SHARE_FONT_COUNT = 4;

/**
 * How long a drawn card may be kept. A card's address is its content, so the same address is
 * always the same picture and can be kept, unless a face was missing: that one is drawn in the
 * fallback face and must not stick anywhere.
 */
export function shareCardCacheControl(fontsLoaded: number): string {
  return fontsLoaded === SHARE_FONT_COUNT ? "public, max-age=86400, s-maxage=604800, immutable" : "no-store";
}

/** The faces the card is set in, as far as they could be loaded. */
export async function shareCardFonts(): Promise<Font[]> {
  const wanted: Array<[string, Font["weight"]]> = [
    [SHARE_FONT_DISPLAY, 600],
    [SHARE_FONT_MONO, 400],
    [SHARE_FONT_MONO, 500],
    [SHARE_FONT_MONO, 600],
  ];
  const loaded = await Promise.all(wanted.map(([name, weight]) => googleFont(name, weight).then((data) => (data ? { name, data, weight, style: "normal" as const } : null))));
  return loaded.filter((font): font is Font => font !== null);
}

const MIME: Record<string, string> = { svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/**
 * One of this site's own public images as a data URI, or null: for a path that is not a plain
 * public path, a type the renderer cannot draw, or a fetch that failed.
 */
export async function publicImage(origin: string, path: string, rewrite?: (svg: string) => string): Promise<string | null> {
  if (!/^\/[A-Za-z0-9._/-]+$/.test(path) || path.includes("..")) return null;
  const type = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  if (!type) return null;
  const data = await once(`image:${origin}${path}`, async () => (await get(`${origin}${path}`))?.arrayBuffer() ?? null);
  if (!data) return null;
  const bytes = rewrite ? Buffer.from(rewrite(Buffer.from(data).toString("utf8")), "utf8") : Buffer.from(data);
  return `data:${type};base64,${bytes.toString("base64")}`;
}
