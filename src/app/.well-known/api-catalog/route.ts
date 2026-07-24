import {
  DOCS_SITE_ORIGIN,
  getRequestDeploymentContext,
} from "@/lib/agent-discovery";

export function GET(request: Request) {
  const context = getRequestDeploymentContext(request);
  const catalog = {
    linkset: [
      {
        anchor: context.apiOrigin,
        "service-desc": [
          {
            href: `${context.siteOrigin}/openapi.json`,
            type: "application/vnd.oai.openapi+json",
          },
        ],
        "service-doc": [
          {
            href: DOCS_SITE_ORIGIN,
            type: "text/html",
          },
        ],
        status: [
          {
            href: `${context.apiOrigin}/health`,
            type: "application/json",
          },
        ],
      },
    ],
  };

  return new Response(JSON.stringify(catalog, null, 2), {
    status: 200,
    headers: {
      "Content-Type":
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
