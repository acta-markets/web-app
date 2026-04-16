import { Metadata } from "next";
import { PortfolioClient } from "@/components/portfolio/portfolio-client";

export const metadata: Metadata = {
  title: "Portfolio"
};

// Disable static generation for this page (requires wallet context)
export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return <PortfolioClient />;
}


