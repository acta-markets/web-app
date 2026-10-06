import Link from "next/link";
import GithubSlugger from "github-slugger";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import {
  getDocsDisplayMarkdown,
  type DocsNavItem,
  type DocsPage,
} from "@/lib/docs-content";

interface DocsArticleProps {
  page: DocsPage;
  previous?: DocsNavItem;
  next?: DocsNavItem;
}

function docsHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

function resolveRelativeSlug(currentSlug: string, target: string) {
  const baseParts = currentSlug.split("/").filter(Boolean);
  if (baseParts.length > 0) baseParts.pop();

  for (const part of target.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  return baseParts.join("/");
}

function normalizeMarkdownHref(href: string, currentSlug: string) {
  if (href.startsWith("#") || href.startsWith("/")) return href;

  const [withoutHash, hash] = href.split("#", 2);
  const target = withoutHash.replace(/\.md$/i, "");
  const resolved = resolveRelativeSlug(currentSlug, target);
  const normalized = docsHref(resolved === "README" ? "" : resolved.replace(/\/README$/, ""));
  return hash ? `${normalized}#${hash}` : normalized;
}

export function DocsArticle({
  page,
  previous,
  next,
}: DocsArticleProps) {
  const markdown = getDocsDisplayMarkdown(page);
  const slugger = new GithubSlugger();
  const headings: Array<{ title: string; id: string }> = [];
  let fence: string | undefined;
  for (const line of markdown.split("\n")) {
    const marker = line.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) {
      if (!fence) fence = marker[0];
      else if (fence === marker[0]) fence = undefined;
      continue;
    }
    if (fence) continue;
    const match = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const title = match[2].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<[^>]+>/g, "").replace(/[`*_]/g, "");
    const id = slugger.slug(title);
    if (match[1].length === 2) headings.push({ title, id });
  }

  const tableOfContents = markdown.length > 4500 && headings.length >= 4 ? (
    <nav aria-label="On this page" className="mb-10 rounded-lg border border-bg-border p-5">
      <p className="mb-3 text-sm font-medium text-content-primary">On this page</p>
      <ul className="grid gap-2 text-sm sm:grid-cols-2">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} className="text-content-secondary hover:text-accent-secondary">{heading.title}</a>
          </li>
        ))}
      </ul>
    </nav>
  ) : null;

  return (
    <>
      <article className="docs-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
            h1: ({ id, children }) => <><h1 id={id}>{children}</h1>{tableOfContents}</>,
            hr: () => null,
            a: ({ href = "", children, ...props }) => {
              const external = /^[a-z][a-z0-9+.-]*:/i.test(href);
              const normalizedHref = external
                ? href
                : normalizeMarkdownHref(href, page.slug);

              return external ? (
                <a
                  href={normalizedHref}
                  target="_blank"
                  rel="noreferrer noopener"
                  {...props}
                >
                  {children}
                </a>
              ) : (
                <Link href={normalizedHref} {...props}>
                  {children}
                </Link>
              );
            },
          }}
        >
          {markdown}
        </ReactMarkdown>
      </article>

      <nav
        aria-label="Documentation pagination"
        className="mt-16 grid grid-cols-2 gap-4 border-t border-bg-border pt-8 max-sm:grid-cols-1"
      >
        {previous ? (
          <Link
            href={docsHref(previous.slug)}
            className="rounded-lg border border-bg-border p-4 transition-colors hover:border-accent-secondary/50 hover:bg-white/[0.025]"
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-content-tertiary">
              Previous
            </span>
            <span className="mt-2 block text-sm font-medium text-content-primary">
              ← {previous.title}
            </span>
          </Link>
        ) : (
          <span />
        )}

        {next && (
          <Link
            href={docsHref(next.slug)}
            className="rounded-lg border border-bg-border p-4 text-right transition-colors hover:border-accent-secondary/50 hover:bg-white/[0.025]"
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-content-tertiary">
              Next
            </span>
            <span className="mt-2 block text-sm font-medium text-content-primary">
              {next.title} →
            </span>
          </Link>
        )}
      </nav>
    </>
  );
}
