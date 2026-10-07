"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { ActaLogo } from "@/components/acta-logo";
import { configuredSiteOrigin } from "@/lib/agent-discovery";
import type {
  DocsNavGroup,
  DocsSearchItem,
} from "@/lib/docs-content";

interface DocsShellProps {
  children: ReactNode;
  navigation: DocsNavGroup[];
  searchIndex: DocsSearchItem[];
}

const DEPLOYMENT_SITE_ORIGIN = configuredSiteOrigin();

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
  const router = useRouter();
  const activeSlug = slugFromPathname(pathname);
  const audience = navigation.find((group) => group.items.some((item) => item.slug === activeSlug))?.audience ?? "user";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [siteHref, setSiteHref] = useState(DEPLOYMENT_SITE_ORIGIN);
  const normalizedQuery = query.trim().toLowerCase();

  useEffect(() => {
    setMobileOpen(false);
    setQuery("");
    setSearchOpen(false);
    setActiveResult(-1);
  }, [pathname]);

  useEffect(() => {
    if (window.location.hostname !== "docs.acta.markets") {
      setSiteHref("/");
    }
  }, []);

  const results = useMemo(() => {
    if (normalizedQuery.length < 2) return [];

    const terms = normalizedQuery.match(/[\p{L}\p{N}_]+/gu) ?? [];
    if (terms.length === 0) return [];
    const matches = (text: string, term: string) =>
      (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).some((word) => word.startsWith(term));

    return searchIndex
      .map((item) => {
        const scores = terms.map((term) =>
          (matches(item.title, term) ? 8 : 0) +
          (matches(item.description, term) ? 4 : 0) +
          (matches(item.text, term) ? 1 : 0),
        );
        const score = scores.every((value) => value > 0)
          ? scores.reduce((sum, value) => sum + value, 0)
          : 0;
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || Number(b.item.audience === audience) - Number(a.item.audience === audience))
      .slice(0, 8)
      .map(({ item }) => item);
  }, [normalizedQuery, searchIndex, audience]);
  const showSearch = searchOpen && normalizedQuery.length >= 2;

  const navigationContent = (
    <nav aria-label="Documentation">
      <div className="mb-8 space-y-1 border-b border-bg-border pb-5">
        {([
          { audience: "user", title: "User guide", slug: "" },
          { audience: "protocol", title: "Protocol & integrations", slug: "protocol" },
        ] as const).map((entry) => (
          <Link
            key={entry.audience}
            href={docsHref(entry.slug)}
            onClick={() => setMobileOpen(false)}
            aria-current={audience === entry.audience ? "true" : undefined}
            className={`block rounded-md px-3 py-2 text-sm font-medium transition-colors ${audience === entry.audience
              ? "bg-white/[0.06] text-content-primary"
              : "text-content-secondary hover:bg-white/[0.04] hover:text-content-primary"}`}
          >
            {entry.title}
          </Link>
        ))}
      </div>
      {navigation.filter((group) => group.audience === audience).map((group) => (
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
                    onClick={() => setMobileOpen(false)}
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
    <div
      className="min-h-screen bg-bg-primary text-content-primary"
      onKeyDown={(event) => {
        if (event.key === "Escape") setMobileOpen(false);
      }}
    >
      <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-bg-border bg-bg-primary/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1440px] items-center gap-4 px-5 max-md:px-3">
          <Link
            href={siteHref}
            className="flex shrink-0 items-center gap-3"
            aria-label="Back to Acta"
          >
            <ActaLogo className="h-7" />
            <span className="border-l border-bg-border pl-3 font-mono text-xs uppercase tracking-[0.12em] text-content-secondary max-sm:hidden">
              Docs
            </span>
          </Link>

          <div
            className="relative ml-auto min-w-0 w-full max-w-md"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false);
            }}
          >
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-content-tertiary"
            />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveResult(-1);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setSearchOpen(false);
                  setActiveResult(-1);
                } else if (results.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();
                  setSearchOpen(true);
                  const index = event.key === "ArrowDown"
                    ? (activeResult + 1) % results.length
                    : (activeResult <= 0 ? results.length - 1 : activeResult - 1);
                  setActiveResult(index);
                  resultRefs.current[index]?.scrollIntoView?.({ block: "nearest" });
                } else if (event.key === "Enter" && showSearch && results.length > 0) {
                  event.preventDefault();
                  router.push(docsHref(results[activeResult < 0 ? 0 : activeResult].slug));
                  setSearchOpen(false);
                  setQuery("");
                }
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={showSearch}
              aria-controls={showSearch ? "docs-search-results" : undefined}
              aria-activedescendant={showSearch && activeResult >= 0 ? `docs-search-result-${activeResult}` : undefined}
              placeholder="Search documentation"
              aria-label="Search documentation"
              className="h-9 w-full rounded-md border border-bg-border bg-black/30 pl-9 pr-3 text-sm text-content-primary outline-none transition-colors placeholder:text-content-tertiary focus:border-accent-secondary"
            />
            {showSearch && (
              <div id="docs-search-results" role={results.length > 0 ? "listbox" : "status"} aria-label="Search results" className="absolute right-0 top-11 z-50 max-h-[420px] w-full overflow-y-auto rounded-lg border border-bg-border bg-bg-secondary p-2 shadow-2xl max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-[60px] max-sm:w-auto">
                {results.length > 0 ? (
                  results.map((item, index) => (
                    <Link
                      key={item.slug || "overview"}
                      id={`docs-search-result-${index}`}
                      role="option"
                      aria-selected={activeResult === index}
                      tabIndex={-1}
                      ref={(element) => { resultRefs.current[index] = element; }}
                      href={docsHref(item.slug)}
                      onClick={() => { setSearchOpen(false); setQuery(""); }}
                      className={`block rounded-md px-3 py-2.5 hover:bg-white/[0.05] ${activeResult === index ? "bg-white/[0.07]" : ""}`}
                    >
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-content-secondary">
                        {item.audience === "user" ? "User guide" : "Protocol & integrations"}
                      </span>
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

          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            aria-expanded={mobileOpen}
            aria-label="Toggle documentation navigation"
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md border border-bg-border text-content-secondary max-lg:flex"
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
