import { altText, type ShareCard, type ShareStat, type ShareTone } from "./card";

/**
 * A share card in a link. The card travels in the address so that a post on X or a message
 * elsewhere can show it: the link's page names the card's image, and the image is drawn from
 * the same address.
 *
 * Anyone can write such an address by hand, so what comes back out is checked hard: every piece
 * of text must be one of the app's own words or fit the shape the app writes (a price, a rate,
 * a date, the sentence of a view). A card can carry a made-up number; it cannot carry a
 * message. The "Devnet" tag is not read from the link at all: the server that draws the card
 * decides it.
 */

const EYEBROWS = new Set(["I believe", "My trade", "Net P&L", "Unrealised P&L"]);
const LABELS = new Set([
  "APR", "Premium earned", "Deposit", "Break-even", "Max gain", "Premium paid", "Expires", "Type",
  "Realised", "Unrealised", "Premium collected", "Now", "Return",
]);
/**
 * Every product name a card can show: the trade page's (`productLabel`, `BUY_PRODUCT_NAME`) and
 * the portfolio's (`productLabelFor`). Kept as plain words so this file stays light enough for
 * a link preview; `params.test.ts` fails when one of those sources gains a name this lacks.
 */
export const SHARE_PRODUCT_NAMES: ReadonlySet<string> = new Set([
  "Cash Put", "Covered Call", "Cash-Secured Put", "Sell Call Spread", "Sell Put Spread",
  "Buy a call", "Buy a put", "Buy a call spread", "Buy a put spread", "Buy a cash put",
  "Covered call", "Call", "Secured put", "Put", "Call spread", "Put spread", "Cash put",
]);
const TONES = new Set<ShareTone>(["up", "down", "plain"]);

const ASSET = /^[A-Za-z0-9]{1,12}$/;
const MONEY = /^[+-]?\$\d[\d,]*(\.\d{1,9})?$/;
/** A price, an amount with its unit, a rate: "$71,521", "38.72 USDC", "12.5 XAU", "+535%". */
const FIGURE = /^[+-]?\$?\d[\d,]*(\.\d{1,9})?%?( [A-Za-z0-9]{1,12})?$/;
const DAY = /^[A-Z][a-z]{2} \d{1,2}$/;
const DATE = /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/;
/** The trade page's view, "BTC will be above $64,500 on Nov 20", and the portfolio's, "BTC ends above $64,500 by Nov 20". */
const VIEW = /^[A-Za-z0-9]{1,12} (will be|ends) (above|below) \$\d[\d,]*(\.\d{1,9})?( (on|by) [A-Z][a-z]{2} \d{1,2})?$/;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const binary = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

type Wire = {
  e: string;
  a: string | null;
  t: string;
  k: "s" | "f";
  n: ShareTone;
  c: string | null;
  s: Array<[label: string, value: string, tone?: ShareTone]>;
  d: string;
};

/** The card as one address-safe string. The tag, alt text and post text are not carried: they are derived or decided on arrival. */
export function encodeShareCard(card: ShareCard): string {
  const wire: Wire = {
    e: card.eyebrow,
    a: card.asset,
    t: card.title,
    k: card.titleKind === "figure" ? "f" : "s",
    n: card.titleTone,
    c: card.caption,
    s: card.stats.map((s) => (s.tone ? [s.label, s.value, s.tone] : [s.label, s.value])),
    d: card.date,
  };
  return toBase64Url(JSON.stringify(wire));
}

const isString = (v: unknown): v is string => typeof v === "string";

function validTitle(wire: Wire): boolean {
  if (wire.k === "f") return MONEY.test(wire.t);
  if (VIEW.test(wire.t)) return true;
  // a trade with no sentence is named "<asset> <product>"
  const space = wire.t.indexOf(" ");
  if (space < 1) return false;
  const product = wire.t.slice(space + 1);
  return ASSET.test(wire.t.slice(0, space)) && [...SHARE_PRODUCT_NAMES].some((name) => name.toLowerCase() === product);
}

function validStat(stat: unknown): stat is Wire["s"][number] {
  if (!Array.isArray(stat) || stat.length < 2 || stat.length > 3) return false;
  const [label, value, tone] = stat;
  if (!isString(label) || !isString(value) || !LABELS.has(label)) return false;
  if (tone !== undefined && !TONES.has(tone)) return false;
  if (label === "Type") return SHARE_PRODUCT_NAMES.has(value);
  if (label === "Expires") return DAY.test(value);
  return FIGURE.test(value);
}

/**
 * Reads a card back out of an address. Null for anything the app could not have written.
 * `tag` is what the reader's own network says, not what the link claims.
 */
export function decodeShareCard(encoded: string | null | undefined, { tag }: { tag: string | null }): ShareCard | null {
  if (!encoded || encoded.length > 2000) return null;
  let wire: Wire;
  try {
    wire = JSON.parse(fromBase64Url(encoded));
  } catch {
    return null;
  }
  if (typeof wire !== "object" || wire === null) return null;
  if (!isString(wire.e) || !EYEBROWS.has(wire.e)) return null;
  if (wire.a !== null && !(isString(wire.a) && ASSET.test(wire.a))) return null;
  if (wire.k !== "s" && wire.k !== "f") return null;
  if (!isString(wire.t) || !validTitle(wire)) return null;
  if (!TONES.has(wire.n)) return null;
  if (wire.c !== null && !(isString(wire.c) && VIEW.test(wire.c))) return null;
  if (!Array.isArray(wire.s) || wire.s.length > 4 || !wire.s.every(validStat)) return null;
  if (!isString(wire.d) || !DATE.test(wire.d)) return null;

  const stats: ShareStat[] = wire.s.map(([label, value, tone]) => (tone ? { label, value, tone } : { label, value }));
  const base = { eyebrow: wire.e, asset: wire.a, title: wire.t, caption: wire.c, stats, tag };
  return {
    ...base,
    titleKind: wire.k === "f" ? "figure" : "sentence",
    titleTone: wire.n,
    date: wire.d,
    alt: altText(base),
    text: "",
    filename: "acta-card",
  };
}

/** Where a card's image is drawn. `scale` 2 is for saving and copying; 1 is what a link preview loads. */
export function shareImagePath(card: ShareCard, scale: 1 | 2 = 1): string {
  return `/share/card?c=${encodeShareCard(card)}${scale === 2 ? "&s=2" : ""}`;
}

/**
 * The link that goes in a post: a page of this site that shows the card and names its image,
 * so the post carries the picture. `site` is the site's own link, which may hold the sharer's
 * referral code; that code is kept.
 */
export function sharePageUrl(site: string, card: ShareCard): string {
  const url = new URL(site);
  url.pathname = "/share";
  url.searchParams.set("c", encodeShareCard(card));
  return url.toString();
}
