import { Metadata } from "next";
import { EarnClient } from "@/components/earn/earn-client";

export const metadata: Metadata = {
  title: "Earn"
};

// Disable static generation for this page (requires wallet context)
export const dynamic = "force-dynamic";

export default function EarnPage() {
  return <EarnClient />;
}



