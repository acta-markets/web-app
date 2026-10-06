import type { Metadata } from "next";
import { DocsArticle } from "@/components/docs/docs-article";
import {
  getDocsCanonicalUrl,
  getDocsNavigation,
  getDocsPage,
} from "@/lib/docs-content";

export const metadata: Metadata = {
  title: "Acta User Guide",
  description:
    "Using Acta: options, vaults, deposits, withdrawals, fees, and risks.",
  alternates: {
    canonical: getDocsCanonicalUrl(),
    types: { "text/markdown": getDocsCanonicalUrl() },
  },
};

export default function DocsHomePage() {
  const page = getDocsPage();
  if (!page) return null;

  const items = getDocsNavigation("user").flatMap((group) => group.items);
  return <DocsArticle page={page} next={items[1]} />;
}
