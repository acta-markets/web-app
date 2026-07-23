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
const DOCS_DESCRIPTIONS: Record<string, string> = {
  "": "Protocol, API, taker, maker, settlement, governance, and operational documentation for Acta Markets.",
  "reference/protocol-flow":
    "Actors, RFQ mechanics, trade lifecycle, settlement scenarios, economics, fees, and protocol risk.",
  "reference/governance":
    "Cold and hot authority boundaries, guardian controls, timelocks, and the on-chain governance permission matrix.",
  "reference/caps":
    "Platform, market, maker, and quote capacity limits, including monitoring and rejection behavior.",
  "reference/faq":
    "Integration questions, troubleshooting guidance, cap failures, order IDs, quotes, and settlement behavior.",
  "quickstart/taker-quickstart":
    "Language-neutral taker flow from wallet authentication and market discovery through RFQ acceptance and transaction signing.",
  "quickstart/taker-wire-examples":
    "Complete taker WebSocket JSON session with authentication, RFQs, quotes, sponsored transactions, and error branches.",
  "quickstart/web-client-ts-sdk":
    "TypeScript SDK integration for taker authentication, discovery, RFQs, sponsored transactions, and event handling.",
  "reference/taker-api":
    "Complete taker WebSocket message, event, error, authentication, RFQ, order, position, and referral reference.",
  "quickstart/maker-quickstart":
    "Language-neutral maker flow for authentication, subscriptions, quotes, fills, recovery, and reconnects.",
  "quickstart/maker-wire-examples":
    "Complete maker WebSocket JSON session covering authentication, subscriptions, quoting, fills, and recovery.",
  "quickstart/maker-rust-sdk":
    "Rust SDK setup for managed WebSocket connections, authentication, request correlation, quoting, and lifecycle events.",
  "reference/maker-api":
    "Complete maker quote and data WebSocket reference, including messages, events, quote rules, caps, and errors.",
  "reference/ws-common":
    "Shared WebSocket envelopes, encodings, units, timeouts, collateral formulas, identifiers, and error conventions.",
  "reference/http-api":
    "Public read-only HTTP endpoints for health, markets, makers, and protocol statistics, including response schemas.",
  "reference/sandbox":
    "Devnet and mainnet endpoints, maker onboarding, test funding, program addresses, and environment differences.",
};

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

function truncateAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const candidate = text.slice(0, limit + 1);
  const boundary = candidate.lastIndexOf(" ");
  return `${candidate.slice(0, boundary > limit * 0.7 ? boundary : limit).trim()}…`;
}

function descriptionFromSource(source: string): string {
  const withoutCode = source.replace(/```[\s\S]*?```/g, "");
  const paragraph = withoutCode
    .replace(/^#\s+.+$/m, "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find(
      (block) =>
        block &&
        !/^(?:#{1,6}\s|[-*+]\s|>\s|\||<)/.test(block),
    );

  return truncateAtWord(plainText(paragraph ?? withoutCode), 180);
}

export function getDocsPage(slugParts: string[] = []): DocsPage | null {
  try {
    const absolute = absoluteMarkdownPath(slugParts);
    if (!statSync(absolute).isFile()) return null;

    const source = readFileSync(absolute, "utf8");
    return {
      title: firstHeading(source),
      description:
        DOCS_DESCRIPTIONS[slugParts.join("/")] ??
        descriptionFromSource(source),
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

function resolveMarkdownTargetSlug(
  currentSlug: string,
  href: string,
): string | null {
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(href)
  ) {
    return null;
  }

  const match = href.match(/^([^?#]+)(\?[^#]*)?(#.*)?$/);
  if (!match || !/\.md$/i.test(match[1])) return null;

  const currentDirectory = currentSlug
    ? path.posix.dirname(currentSlug)
    : "";
  const markdownPath = path.posix.normalize(
    path.posix.join(currentDirectory, match[1]),
  );
  const withoutExtension = markdownPath.replace(/\.md$/i, "");
  return withoutExtension === "README"
    ? ""
    : withoutExtension.replace(/\/README$/i, "");
}

function canonicalizeMarkdownTarget(currentSlug: string, href: string): string {
  const slug = resolveMarkdownTargetSlug(currentSlug, href);
  if (slug === null) return href;

  const match = href.match(/^([^?#]+)(\?[^#]*)?(#.*)?$/);
  if (!match) return href;

  return `${getDocsCanonicalUrl(slug)}${match[2] ?? ""}${match[3] ?? ""}`;
}

function readableMarkdownLabel(
  currentSlug: string,
  label: string,
  href: string,
  titles: Map<string, string>,
): string {
  const slug = resolveMarkdownTargetSlug(currentSlug, href);
  if (slug === null) return label;

  const title = titles.get(slug);
  if (!title) return label;

  const plainLabel = label.replace(/^`|`$/g, "");
  const targetPath = href.split(/[?#]/, 1)[0];
  const filename = path.posix.basename(targetPath);

  if (plainLabel === targetPath || plainLabel === filename) {
    return title;
  }

  if (plainLabel.includes(filename)) {
    return plainLabel.replaceAll(filename, title);
  }

  return label;
}

function removeThematicBreaks(markdown: string): string {
  let fenced = false;

  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        fenced = !fenced;
        return line;
      }

      return !fenced && /^\s*(?:---|\*\*\*|___)\s*$/.test(line)
        ? ""
        : line;
    })
    .join("\n");
}

export function getDocsDisplayMarkdown(page: DocsPage): string {
  const titles = new Map(
    getDocsNavigation()
      .flatMap((group) => group.items)
      .map((item) => [item.slug, item.title]),
  );

  return removeThematicBreaks(page.source).replace(
    /(?<!!)\[([^\]]+)]\(([^) \t\n]+)\)/g,
    (_match, label: string, href: string) =>
      `[${readableMarkdownLabel(page.slug, label, href, titles)}](${href})`,
  );
}

export function getDocsAgentMarkdown(page: DocsPage): string {
  return getDocsDisplayMarkdown(page).replace(
    /(\]\()([^) \t\n]+)(\))/g,
    (_match, opening: string, href: string, closing: string) =>
      `${opening}${canonicalizeMarkdownTarget(page.slug, href)}${closing}`,
  );
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
    .map(
      (group) => `### ${group.title}

${group.items
        .map(
        (item) =>
          `- [${item.title}](${getDocsCanonicalUrl(item.slug)}): ${
            getDocsPage(item.slug ? item.slug.split("/") : [])?.description ?? ""
          }`,
        )
        .join("\n")}`,
    )
    .join("\n\n");

  return `# Acta Protocol Documentation

> Protocol, public API, taker, maker, settlement, governance, and operational documentation for Acta Markets.

## Agent access

- Request any documentation URL with \`Accept: text/markdown\` for the compact Markdown representation.
- Use [the sitemap](https://docs.acta.markets/sitemap.xml) for the complete canonical page index.
- Use each response's \`Content-Location\` and \`Link: rel="canonical"\` values as the stable URL.

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
