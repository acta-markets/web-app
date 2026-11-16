import { lineupAssetsText } from "./vaults/lineup";

/**
 * The pictures a link to the site gets in a post or a chat: what each one says. Plain data,
 * so a page's metadata can name its picture (address, size, alt text) without drawing it;
 * `site-image.tsx` draws them and `/og/[name]` serves them.
 */

export const SITE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/** A blank in a headline, as the Trade page's sentence has: drawn as an outlined box with its name inside. */
export type HeadlineSlot = { slot: string };
/** Words, with a line break kept where one is written, or a sentence of words and blanks. */
export type Headline = string | ReadonlyArray<string | HeadlineSlot>;

export type SiteImage = {
  headline: Headline;
  /** the quiet line under the headline */
  line: string;
  /** the picture in words, given the site's name ("Acta" or "Acta Devnet") */
  alt: (siteName: string) => string;
};

export const SITE_IMAGES = {
  /** any page with no picture of its own: the site in one line */
  site: {
    headline: "Options and curated\nyield vaults",
    line: "On Solana. Paid by trading desks.",
    alt: (siteName) => `${siteName}: options and curated yield vaults on Solana`,
  },
  /** Trade: the page's own sentence with its blanks open. No example price, which would go stale and read as a quote. */
  trade: {
    headline: ["I believe", { slot: "asset" }, "will be", { slot: "above" }, { slot: "price" }, "on", { slot: "date" }],
    line: "Get paid now, or pay a premium and profit if you are right.",
    alt: (siteName) => `Trade on ${siteName}: I believe an asset will be above or below a price on a date`,
  },
  /** Earn and each vault page. The lineup's own assets, and no rate: its rates are assumptions a picture cannot qualify. */
  earn: {
    headline: "Income vaults",
    line: `On ${lineupAssetsText()}. Deposit what you already hold.`,
    alt: (siteName) => `Earn on ${siteName}: income vaults on ${lineupAssetsText()}`,
  },
} satisfies Record<string, SiteImage>;

export type SiteImageName = keyof typeof SITE_IMAGES;

export function isSiteImageName(name: string): name is SiteImageName {
  return Object.prototype.hasOwnProperty.call(SITE_IMAGES, name);
}

/** Where a picture is served. Outside `/api`, which robots.txt closes to the crawlers that build previews. */
export function siteImagePath(name: SiteImageName): string {
  return `/og/${name}`;
}
