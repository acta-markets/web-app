import { NextResponse, type NextRequest } from "next/server";

function isAppEnabled() {
  // Default: enabled. Set to "false" in prod to ship landing-only + waitlist.
  const v = process.env.NEXT_PUBLIC_APP_ENABLED;
  if (!v) return true;
  return !(v === "false" || v === "0");
}

const BLOCKED_PAGE_PREFIXES = ["/earn", "/portfolio", "/market"];
const BLOCKED_API_PREFIXES = ["/api/market", "/api/pyth", "/api/portfolio"];

export function middleware(req: NextRequest) {
  if (isAppEnabled()) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Never block Next internals or static assets.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/tokens") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/fonts") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml"
  ) {
    return NextResponse.next();
  }

  // Allow waitlist join + health/env check while app is disabled.
  if (pathname === "/api/whitelist" || pathname.startsWith("/api/envcheck")) {
    return NextResponse.next();
  }

  const blocked =
    BLOCKED_PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    BLOCKED_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!blocked) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("app", "closed");
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/:path*"]
};


