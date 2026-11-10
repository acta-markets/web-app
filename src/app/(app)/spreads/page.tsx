import { Metadata } from "next";
import { SpreadsShell } from "@/components/spreads/spreads-shell";

export const metadata: Metadata = {
  title: "Spreads",
};

export const dynamic = "force-dynamic";

export default function SpreadsPage() {
  return <SpreadsShell />;
}
