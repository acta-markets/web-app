import { NextResponse, type NextRequest } from "next/server";
import {
  acceptsMarkdown,
  DOCS_SITE_ORIGIN,
  getDiscoveryLinkHeader,
  getEarnMarkdown,
  getHomeMarkdown,
  getRequestDeploymentContext,
} from "@/lib/agent-discovery";

function isAppEnabled() {
  // Default: enabled. Set to "false" in prod to ship landing-only + waitlist.
  const v = process.env.NEXT_PUBLIC_APP_ENABLED;
  if (!v) return true;
  return !(v === "false" || v === "0");
}

const BLOCKED_PAGE_PREFIXES = ["/earn", "/portfolio", "/market"];
const BLOCKED_API_PREFIXES = ["/api/market", "/api/pyth", "/api/portfolio"];
const MARKDOWN_PATHS = new Set(["/", "/earn"]);
const DOCS_HOSTNAME = "docs.acta.markets";
const DOCS_RESERVED_PATHS = [
  "/_next",
  "/.well-known",
  "/api",
  "/auth.md",
  "/favicon",
  "/fonts",
  "/images",
  "/llms.txt",
  "/openapi.json",
  "/robots.txt",
  "/sitemap.xml",
  "/tokens",
];

function requestHostname(req: NextRequest) {
  return (req.headers.get("host") ?? req.nextUrl.hostname)
    .split(":")[0]
    .toLowerCase();
}

function isDocsHost(req: NextRequest) {
  return requestHostname(req) === DOCS_HOSTNAME;
}

function isDocsReservedPath(pathname: string) {
  return DOCS_RESERVED_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function docsSlug(pathname: string, docsHost: boolean): string | null {
  if (docsHost) {
    if (isDocsReservedPath(pathname)) return null;
    return pathname.replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
  }

  if (pathname === "/docs") return "";
  if (pathname.startsWith("/docs/")) {
    return pathname
      .slice("/docs/".length)
      .replace(/\/+$/g, "")
      .replace(/\.md$/i, "");
  }
  return null;
}

function markdownForPath(req: NextRequest): string | null {
  const context = getRequestDeploymentContext(req);

  switch (req.nextUrl.pathname) {
    case "/":
      return getHomeMarkdown(context);
    case "/earn":
      return getEarnMarkdown(context);
    default:
      return null;
  }
}

function withDiscoveryHeaders(
  response: NextResponse,
  pathname: string,
  variesOnAccept: boolean,
  docsHost = false,
) {
  if (variesOnAccept) {
    const vary = response.headers.get("Vary");
    if (!vary) {
      response.headers.set("Vary", "Accept");
    } else if (!vary.toLowerCase().split(",").some((value) => value.trim() === "accept")) {
      response.headers.set("Vary", `${vary}, Accept`);
    }
  }

  if (!docsHost && pathname === "/") {
    response.headers.set("Link", getDiscoveryLinkHeader());
  } else if (docsHost) {
    const slug = docsSlug(pathname, true) ?? "";
    const canonical = slug
      ? `${DOCS_SITE_ORIGIN}/${slug}`
      : DOCS_SITE_ORIGIN;
    response.headers.set(
      "Link",
      `<${canonical}>; rel="canonical"; type="text/html", <${DOCS_SITE_ORIGIN}>; rel="service-doc"; type="text/html", <${DOCS_SITE_ORIGIN}/llms.txt>; rel="describedby"; type="text/plain"`,
    );
  }

  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const docsHost = isDocsHost(req);

  if (docsHost && (pathname === "/docs" || pathname.startsWith("/docs/"))) {
    const canonicalUrl = new URL(req.nextUrl.toString());
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = DOCS_HOSTNAME;
    canonicalUrl.port = "";
    canonicalUrl.pathname = pathname.slice("/docs".length) || "/";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const markdownPath =
    pathname.toLowerCase().endsWith(".md") &&
    (docsHost || pathname.startsWith("/docs/"));

  // Browsers navigating to a .md alias get the canonical HTML page; every
  // other client (curl, agent fetchers) gets the Markdown itself.
  if (
    markdownPath &&
    !acceptsMarkdown(req.headers.get("accept")) &&
    (req.headers.get("accept") ?? "").includes("text/html")
  ) {
    const canonicalUrl = docsHost
      ? new URL(`${DOCS_SITE_ORIGIN}${pathname}`)
      : req.nextUrl.clone();
    canonicalUrl.pathname = pathname.slice(0, -3);
    return NextResponse.redirect(canonicalUrl, 308);
  }

  const requestedDocsSlug = docsSlug(pathname, docsHost);

  if (
    requestedDocsSlug !== null &&
    (markdownPath || acceptsMarkdown(req.headers.get("accept")))
  ) {
    const markdownUrl = req.nextUrl.clone();
    markdownUrl.pathname = "/api/docs-markdown";
    markdownUrl.search = "";
    if (requestedDocsSlug) {
      markdownUrl.searchParams.set("slug", requestedDocsSlug);
    }
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-acta-docs-slug", requestedDocsSlug);
    return NextResponse.rewrite(markdownUrl, {
      request: { headers: requestHeaders },
    });
  }

  if (docsHost && requestedDocsSlug !== null) {
    const docsUrl = req.nextUrl.clone();
    docsUrl.pathname = requestedDocsSlug
      ? `/docs/${requestedDocsSlug}`
      : "/docs";
    return withDiscoveryHeaders(
      NextResponse.rewrite(docsUrl),
      pathname,
      true,
      true,
    );
  }

  const blocked =
    BLOCKED_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    BLOCKED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!isAppEnabled() && blocked) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("app", "closed");
    return NextResponse.redirect(url);
  }

  if (acceptsMarkdown(req.headers.get("accept"))) {
    const markdown = markdownForPath(req);

    if (markdown) {
      const response = new NextResponse(markdown, {
        status: 200,
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Cache-Control": "public, max-age=300",
          Vary: "Accept",
        },
      });

      return withDiscoveryHeaders(response, pathname, true);
    }
  }

  return withDiscoveryHeaders(
    NextResponse.next(),
    pathname,
    MARKDOWN_PATHS.has(pathname) || requestedDocsSlug !== null,
  );
}

export const config = {
  matcher: ["/((?!_next/|favicon\\.ico).*)"],
};
