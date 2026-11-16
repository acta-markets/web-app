import type { Metadata } from "next";
import { configuredSiteOrigin } from "./agent-discovery";
import { IS_MAINNET } from "./network";
import { SITE_IMAGES, SITE_IMAGE_SIZE, siteImagePath, type SiteImageName } from "./site-images";
import { getToken } from "./tokens";

/**
 * What the site says about itself outside its own pages: the browser tab, a search result and
 * the preview a link gets in a post or a chat. One place, so a page states its title and one
 * line and everything else (the site's name, the page's own address, the devnet note) follows.
 *
 * On devnet the name and every description say so. The funds there are test funds, and a
 * preview must never let them read as real money.
 */

/** The site in one line: both things it does. */
export const SITE_LINE = "Options and curated yield vaults on Solana";
/** The site's default description, for a page that has no line of its own. */
export const SITE_DESCRIPTION =
  "Options and curated yield vaults on Solana. Say where a price will be and get paid for it, or deposit what you hold and earn premium from trading desks.";
/** Closes every description on devnet. */
export const DEVNET_NOTE = "Devnet: test funds only.";

export function siteName(mainnet: boolean = IS_MAINNET): string {
  return mainnet ? "Acta" : "Acta Devnet";
}
export const SITE_NAME = siteName();

/**
 * The address this site is known by, for a page's own link and for `og:url`. A devnet build
 * is always the devnet site: the Vercel project's production address belongs to another
 * environment, and a page that named it as its own would tell a search engine it is a copy.
 */
export function siteOrigin(): string {
  if (!IS_MAINNET) return configuredSiteOrigin();
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : configuredSiteOrigin())
  );
}

/** A description as it is published: with the devnet note on devnet. */
export function describe(description: string, mainnet: boolean = IS_MAINNET): string {
  return mainnet ? description : `${description} ${DEVNET_NOTE}`;
}

export type PageMetadataInput = {
  /** The page's own name, without the site's: "Trade". Omit for the site's default title. */
  title?: string;
  description?: string;
  /** The page's address on this site, without a query: "/trade". */
  path: string;
  /** false keeps the page out of search results. */
  index?: boolean;
  /** Which of the site's pictures a link to the page shows. */
  image?: SiteImageName;
};

/**
 * A picture as a page's metadata names it. The address is left relative: Next completes it
 * with the address the deployment answers at, so a preview build loads its own picture.
 */
export function previewImage(image: SiteImageName, mainnet: boolean = IS_MAINNET) {
  return { url: siteImagePath(image), ...SITE_IMAGE_SIZE, alt: SITE_IMAGES[image].alt(siteName(mainnet)) };
}

/** `pageMetadata` with the environment passed in, so both environments can be tested. */
export function buildPageMetadata(
  { title, description = SITE_DESCRIPTION, path, index = true, image = "site" }: PageMetadataInput,
  { mainnet, origin }: { mainnet: boolean; origin: string },
): Metadata {
  const name = siteName(mainnet);
  const said = describe(description, mainnet);
  const url = `${origin.replace(/\/$/, "")}${path === "/" ? "" : path}`;
  return {
    ...(title ? { title } : {}),
    description: said,
    alternates: { canonical: url },
    // A page's preview fields replace the whole of what the layout set, picture included, so
    // every one is stated here. The title carries the site's name itself: a preview shows it
    // without the tab's suffix.
    openGraph: {
      title: title ? `${title} | ${name}` : `${name}: ${SITE_LINE}`,
      description: said,
      url,
      siteName: name,
      type: "website",
      images: [previewImage(image, mainnet)],
    },
    ...(index ? {} : { robots: { index: false, follow: false } }),
  };
}

/** A page's metadata: its title and line, its own address, and the picture a link to it shows. */
export function pageMetadata(input: PageMetadataInput): Metadata {
  return buildPageMetadata(input, { mainnet: IS_MAINNET, origin: siteOrigin() });
}

/**
 * The Trade page's title for a link that preselects an asset (`?asset=BTC`): "Trade BTC".
 * Only a token the app knows is named, written the app's way, so a link cannot put words of
 * its own into the title.
 */
export function tradeTitle(asset: string | string[] | undefined): string {
  const requested = Array.isArray(asset) ? asset[0] : asset;
  const symbol = requested && /^[A-Za-z0-9]{1,12}$/.test(requested) ? getToken(requested)?.symbol : undefined;
  return symbol ? `Trade ${symbol}` : "Trade";
}
