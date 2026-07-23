import "server-only";

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export interface DocsNavItem {
  title: string;
  slug: string;
}

export interface DocsNavGroup {
  title: string;
  items: DocsNavItem[];
}

export interface DocsPage {
  title: string;
  description: string;
  slug: string;
  source: string;
}

export interface DocsSearchItem extends DocsNavItem {
  description: string;
  text: string;
}

const DOCS_ROOT = path.join(process.cwd(), "docs-site");
const SUMMARY_PATH = path.join(DOCS_ROOT, "SUMMARY.md");

function assertSafeSlug(parts: string[]) {
  if (
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.includes("/") ||
        part.includes("\\") ||
        !/^[a-z0-9-]+$/i.test(part),
    )
  ) {
    throw new Error("Invalid documentation slug");
  }
}

function slugFromMarkdownPath(markdownPath: string): string {
  if (markdownPath === "README.md") return "";
  return markdownPath.replace(/\.md$/i, "");
}

function markdownPathFromSlug(parts: string[]): string {
  if (parts.length === 0) return "README.md";
  assertSafeSlug(parts);
  return `${parts.join("/")}.md`;
}

function absoluteMarkdownPath(parts: string[]): string {
  const absolute = path.resolve(DOCS_ROOT, markdownPathFromSlug(parts));
  if (!absolute.startsWith(`${DOCS_ROOT}${path.sep}`)) {
    throw new Error("Documentation path escapes its content root");
  }
  return absolute;
}

function firstHeading(source: string): string {
  return (
    source.match(/^#\s+(.+)$/m)?.[1]?.trim() ??
    "Acta Protocol Documentation"
  );
}

function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionFromSource(source: string): string {
  const withoutTitle = source.replace(/^#\s+.+$/m, "");
  return plainText(withoutTitle).slice(0, 220);
}

export function getDocsPage(slugParts: string[] = []): DocsPage | null {
  try {
    const absolute = absoluteMarkdownPath(slugParts);
    if (!statSync(absolute).isFile()) return null;

    const source = readFileSync(absolute, "utf8");
    return {
      title: firstHeading(source),
      description: descriptionFromSource(source),
      slug: slugParts.join("/"),
      source,
    };
  } catch {
    return null;
  }
}

export function getDocsNavigation(): DocsNavGroup[] {
  const summary = readFileSync(SUMMARY_PATH, "utf8");
  const groups: DocsNavGroup[] = [];
  let current: DocsNavGroup = { title: "Overview", items: [] };
  groups.push(current);

  for (const line of summary.split("\n")) {
    const groupMatch = line.match(/^##\s+(.+)$/);
    if (groupMatch) {
      current = { title: groupMatch[1].trim(), items: [] };
      groups.push(current);
      continue;
    }

    const itemMatch = line.match(/^\*\s+\[([^\]]+)]\(([^)]+\.md)\)$/);
    if (itemMatch) {
      current.items.push({
        title: itemMatch[1].trim(),
        slug: slugFromMarkdownPath(itemMatch[2].trim()),
      });
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

export function getDocsSearchIndex(): DocsSearchItem[] {
  return getDocsNavigation().flatMap((group) =>
    group.items.map((item) => {
      const page = getDocsPage(item.slug ? item.slug.split("/") : []);
      return {
        ...item,
        description: page?.description ?? "",
        text: page ? plainText(page.source).slice(0, 4000) : "",
      };
    }),
  );
}

export function getAllDocsSlugs(): string[][] {
  return getDocsNavigation()
    .flatMap((group) => group.items)
    .map((item) => item.slug)
    .filter(Boolean)
    .map((slug) => slug.split("/"));
}

export function getDocsCanonicalUrl(slug = ""): string {
  return slug
    ? `https://docs.acta.markets/${slug}`
    : "https://docs.acta.markets";
}

export function getDocsSourceUrl(slug = ""): string {
  const file = slug ? `${slug}.md` : "README.md";
  return `https://github.com/acta-markets/web-app/blob/main/docs-site/${file}`;
}

export function getDocsMarkdownFiles(): string[] {
  const walk = (directory: string): string[] =>
    readdirSync(directory).flatMap((entry) => {
      const absolute = path.join(directory, entry);
      return statSync(absolute).isDirectory()
        ? walk(absolute)
        : entry.endsWith(".md") && entry !== "SUMMARY.md"
          ? [absolute]
          : [];
    });

  return walk(DOCS_ROOT)
    .map((absolute) => path.relative(DOCS_ROOT, absolute))
    .map(slugFromMarkdownPath)
    .sort();
}

export function isDocsRequest(request: Request): boolean {
  const host = (request.headers.get("host") ?? new URL(request.url).hostname)
    .split(":")[0]
    .toLowerCase();
  return host === "docs.acta.markets";
}

export function getDocsSitemapUrls(): string[] {
  return getDocsMarkdownFiles().map(getDocsCanonicalUrl);
}

export function getDocsLlmsText(): string {
  const pages = getDocsNavigation()
    .flatMap((group) =>
      group.items.map(
        (item) =>
          `- [${item.title}](${getDocsCanonicalUrl(item.slug)}): ${
            getDocsPage(item.slug ? item.slug.split("/") : [])?.description ?? ""
          }`,
      ),
    )
    .join("\n");

  return `# Acta Protocol Documentation

> Protocol, public API, taker, maker, settlement, governance, and operational documentation for Acta Markets.

## Documentation

${pages}

## Machine-readable API resources

- [Beta API catalog](https://beta.acta.markets/.well-known/api-catalog)
- [Beta OpenAPI](https://beta.acta.markets/openapi.json)
- [Devnet API catalog](https://devnet.acta.markets/.well-known/api-catalog)
- [Devnet OpenAPI](https://devnet.acta.markets/openapi.json)
`;
}

export function getDocsRobotsText(): string {
  const contentSignal = "Content-Signal: ai-train=no, search=yes, ai-input=yes";
  const aiAgents = [
    "GPTBot",
    "OAI-SearchBot",
    "Claude-Web",
    "Google-Extended",
    "Amazonbot",
    "anthropic-ai",
    "Bytespider",
    "CCBot",
    "Applebot-Extended",
  ];
  const aiGroups = aiAgents
    .map(
      (agent) => `User-agent: ${agent}
Allow: /
${contentSignal}`,
    )
    .join("\n\n");

  return `# Acta documentation crawl policy
User-agent: *
Allow: /
${contentSignal}

${aiGroups}

Sitemap: https://docs.acta.markets/sitemap.xml
`;
}
