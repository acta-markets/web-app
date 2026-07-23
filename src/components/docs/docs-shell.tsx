"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActaLogo } from "@/components/acta-logo";
import type {
  DocsNavGroup,
  DocsSearchItem,
} from "@/lib/docs-content";

interface DocsShellProps {
  children: ReactNode;
  navigation: DocsNavGroup[];
  searchIndex: DocsSearchItem[];
}

function docsHref(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

function slugFromPathname(pathname: string) {
  if (pathname === "/docs" || pathname === "/") return "";
  return pathname.replace(/^\/docs\/?/, "").replace(/^\//, "");
}

export function DocsShell({
  children,
  navigation,
  searchIndex,
}: DocsShellProps) {
  const pathname = usePathname();
  const activeSlug = slugFromPathname(pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setMobileOpen(false);
    setQuery("");
  }, [pathname]);

  const results = useMemo(() => {
    if (normalizedQuery.length < 2) return [];

    return searchIndex
      .map((item) => {
        const title = item.title.toLowerCase();
        const description = item.description.toLowerCase();
        const text = item.text.toLowerCase();
        const score =
          (title.includes(normalizedQuery) ? 3 : 0) +
          (description.includes(normalizedQuery) ? 2 : 0) +
          (text.includes(normalizedQuery) ? 1 : 0);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(({ item }) => item);
  }, [normalizedQuery, searchIndex]);

  const navigationContent = (
    <nav aria-label="Documentation">
      {navigation.map((group) => (
        <section key={group.title} className="mb-8">
          <h2 className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-content-tertiary">
            {group.title}
          </h2>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.slug === activeSlug;
              return (
                <li key={item.slug || "overview"}>
                  <Link
                    href={docsHref(item.slug)}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2 text-sm leading-5 transition-colors ${
                      active
                        ? "bg-accent-secondary/10 font-medium text-accent-secondary"
                        : "text-content-secondary hover:bg-white/[0.04] hover:text-content-primary"
                    }`}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-bg-primary text-content-primary">
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-bg-border bg-bg-primary/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4 px-5 max-md:px-3">
          <Link href="/docs" className="flex shrink-0 items-center gap-3" aria-label="Acta docs home">
            <ActaLogo className="h-7" />
            <span className="border-l border-bg-border pl-3 font-mono text-xs uppercase tracking-[0.12em] text-content-secondary">
              Docs
            </span>
          </Link>

          <div className="relative ml-auto w-full max-w-md">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documentation"
              aria-label="Search documentation"
              className="h-9 w-full rounded-md border border-bg-border bg-black/30 pl-9 pr-3 text-sm text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-accent-secondary"
            />
            {normalizedQuery.length >= 2 && (
              <div className="absolute right-0 top-11 z-50 max-h-[420px] w-full overflow-y-auto rounded-lg border border-bg-border bg-bg-secondary p-2 shadow-2xl">
                {results.length > 0 ? (
                  results.map((item) => (
                    <Link
                      key={item.slug || "overview"}
                      href={docsHref(item.slug)}
                      className="block rounded-md px-3 py-2.5 hover:bg-white/[0.05]"
                    >
                      <span className="block text-sm font-medium text-content-primary">
                        {item.title}
                      </span>
                      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-content-secondary">
                        {item.description}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="px-3 py-5 text-center text-sm text-content-secondary">
                    No documentation found.
                  </p>
                )}
              </div>
            )}
          </div>

          <a
            href="https://github.com/acta-markets/web-app/tree/main/docs-site"
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 font-mono text-xs text-content-secondary transition-colors hover:text-content-primary max-md:hidden"
          >
            Markdown source ↗
          </a>

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle documentation navigation"
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-bg-border text-content-secondary max-lg:flex"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] pt-16">
        <aside className="fixed bottom-0 top-16 z-30 w-72 overflow-y-auto border-r border-bg-border bg-bg-primary px-5 py-8 max-lg:hidden">
          {navigationContent}
        </aside>

        {mobileOpen && (
          <>
            <button
              type="button"
              aria-label="Close documentation navigation"
              className="fixed inset-0 top-16 z-20 bg-black/70 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="fixed bottom-0 left-0 top-16 z-30 w-[min(86vw,320px)] overflow-y-auto border-r border-bg-border bg-bg-primary px-5 py-7 lg:hidden">
              {navigationContent}
            </aside>
          </>
        )}

        <main className="min-w-0 flex-1 pl-72 max-lg:pl-0">
          <div className="mx-auto w-full max-w-[920px] px-12 py-14 max-md:px-5 max-md:py-9">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
