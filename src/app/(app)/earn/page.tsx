import { Metadata } from "next";
import { EarnClient } from "@/components/earn/earn-client";

export const metadata: Metadata = {
  title: "Earn"
};

export default function EarnPage() {
  return <EarnClient />;
}



