import { getDocsCanonicalUrl, getDocsPage } from "@/lib/docs-content";

export const runtime = "nodejs";

export function GET(request: Request) {
  const url = new URL(request.url);
  const slug = (
    request.headers.get("x-acta-docs-slug") ??
    url.searchParams.get("slug") ??
    ""
  ).replace(/^\/+|\/+$/g, "");
  const page = getDocsPage(slug ? slug.split("/") : []);

  if (!page) {
    return new Response("# Documentation page not found\n", {
      status: 404,
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  }

  const canonical = getDocsCanonicalUrl(page.slug);
  return new Response(page.source, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Location": canonical,
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
      Vary: "Accept",
      Link: `<${canonical}>; rel="canonical"; type="text/html"`,
      "x-markdown-tokens": String(Math.ceil(page.source.length / 4)),
    },
  });
}
