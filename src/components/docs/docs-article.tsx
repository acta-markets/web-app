import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { DocsNavItem, DocsPage } from "@/lib/docs-content";

interface DocsArticleProps {
  page: DocsPage;
  previous?: DocsNavItem;
  next?: DocsNavItem;
  sourceUrl: string;
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
  const normalized = docsHref(resolved);
  return hash ? `${normalized}#${hash}` : normalized;
}

export function DocsArticle({
  page,
  previous,
  next,
  sourceUrl,
}: DocsArticleProps) {
  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-4 border-b border-bg-border pb-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent-secondary">
          Acta protocol documentation
        </p>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="font-mono text-xs text-content-tertiary transition-colors hover:text-content-primary"
        >
          Edit on GitHub ↗
        </a>
      </div>

      <article className="docs-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSlug]}
          components={{
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
          {page.source}
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
