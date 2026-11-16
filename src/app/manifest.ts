import type { MetadataRoute } from "next";
import { BRAND_BG } from "@/lib/brand";
import { APP_HOME } from "@/lib/app-enabled";
import { SITE_LINE, SITE_NAME } from "@/lib/site-metadata";

/**
 * What the site is called and looks like when it is saved to a phone's home screen or
 * installed: its name (which says Devnet on devnet), its icon, and Trade as the page it opens on.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_LINE,
    start_url: APP_HOME,
    display: "standalone",
    background_color: BRAND_BG,
    theme_color: BRAND_BG,
    icons: [
      { src: "/app-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/app-icon/512", sizes: "512x512", type: "image/png" },
      { src: "/app-icon/512-maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
