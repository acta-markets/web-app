import { Metadata } from "next";
import { SpreadsShell } from "@/components/spreads/spreads-shell";
import { pageMetadata } from "@/lib/site-metadata";

// a working page, not one the site offers: kept out of search results
export const metadata: Metadata = pageMetadata({ title: "Spreads", path: "/spreads", index: false });

export const dynamic = "force-dynamic";

export default function SpreadsPage() {
  return <SpreadsShell />;
}
