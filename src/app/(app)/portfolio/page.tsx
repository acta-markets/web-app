import { Metadata } from "next";
import { PortfolioClient } from "@/components/portfolio/portfolio-client";

export const metadata: Metadata = {
  title: "Portfolio"
};

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return <PortfolioClient />;
}


