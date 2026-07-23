import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocsArticle } from "@/components/docs/docs-article";
import {
  getAllDocsSlugs,
  getDocsCanonicalUrl,
  getDocsNavigation,
  getDocsPage,
  getDocsSourceUrl,
} from "@/lib/docs-content";

interface DocsPageProps {
  params: { slug: string[] };
}

export function generateStaticParams() {
  return getAllDocsSlugs().map((slug) => ({ slug }));
}

export function generateMetadata({ params }: DocsPageProps): Metadata {
  const page = getDocsPage(params.slug);
  if (!page) return {};

  return {
    title: `${page.title} | Acta Docs`,
    description: page.description,
    alternates: {
      canonical: getDocsCanonicalUrl(page.slug),
      types: { "text/markdown": getDocsCanonicalUrl(page.slug) },
    },
  };
}

export default function DocumentationPage({ params }: DocsPageProps) {
  const page = getDocsPage(params.slug);
  if (!page) notFound();

  const items = getDocsNavigation().flatMap((group) => group.items);
  const index = items.findIndex((item) => item.slug === page.slug);

  return (
    <DocsArticle
      page={page}
      previous={index > 0 ? items[index - 1] : undefined}
      next={index >= 0 ? items[index + 1] : undefined}
      sourceUrl={getDocsSourceUrl(page.slug)}
    />
  );
}
