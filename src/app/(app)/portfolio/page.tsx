import { Metadata } from "next";
import { PortfolioClient } from "@/components/portfolio/portfolio-client";
import { pageMetadata } from "@/lib/site-metadata";

// one wallet's own figures: not a page for a search result
export const metadata: Metadata = pageMetadata({ title: "Portfolio", path: "/portfolio", index: false });

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return <PortfolioClient />;
}


