import { getRequestDeploymentContext } from "@/lib/agent-discovery";
import { aiCatalog } from "@/lib/agent/hosted";

/** The domain's AI catalog: it names the MCP server card and nothing else. */
export function GET(request: Request) {
  const { siteOrigin } = getRequestDeploymentContext(request);
  return new Response(JSON.stringify(aiCatalog(siteOrigin), null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/ai-catalog+json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
