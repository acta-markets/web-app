import { siteImage } from "@/lib/site-image";
import { SITE_IMAGES, isSiteImageName } from "@/lib/site-images";

/**
 * A page's link-preview picture, by name: `/og/site`, `/og/trade`, `/og/earn`. Each page's
 * metadata names one of these (`pageMetadata` in `src/lib/site-metadata.ts`).
 */
export const dynamic = "force-static";
// drawn again every hour, so a picture made while a typeface could not be loaded does not stay
export const revalidate = 3600;

export function generateStaticParams() {
  return Object.keys(SITE_IMAGES).map((name) => ({ name }));
}

export function GET(_req: Request, { params }: { params: { name: string } }) {
  if (!isSiteImageName(params.name)) return new Response("Not a picture", { status: 404 });
  return siteImage(params.name);
}
