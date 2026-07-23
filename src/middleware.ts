import { NextResponse, type NextRequest } from "next/server";
import {
  acceptsMarkdown,
  getDeploymentContext,
  getDiscoveryLinkHeader,
  getEarnMarkdown,
  getHomeMarkdown,
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

function markdownForPath(req: NextRequest): string | null {
  const context = getDeploymentContext(req.url);

  switch (req.nextUrl.pathname) {
    case "/":
      return getHomeMarkdown(context);
    case "/earn":
      return getEarnMarkdown(context);
    default:
      return null;
  }
}

function withHomepageDiscoveryHeaders(response: NextResponse, pathname: string) {
  if (MARKDOWN_PATHS.has(pathname)) {
    const vary = response.headers.get("Vary");
    if (!vary) {
      response.headers.set("Vary", "Accept");
    } else if (!vary.toLowerCase().split(",").some((value) => value.trim() === "accept")) {
      response.headers.set("Vary", `${vary}, Accept`);
    }
  }

  if (pathname === "/") {
    response.headers.set("Link", getDiscoveryLinkHeader());
  }

  return response;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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
          "x-markdown-tokens": String(Math.ceil(markdown.length / 4)),
        },
      });

      return withHomepageDiscoveryHeaders(response, pathname);
    }
  }

  return withHomepageDiscoveryHeaders(NextResponse.next(), pathname);
}

export const config = {
  matcher: ["/:path*"],
};
