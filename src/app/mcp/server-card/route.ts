import { getRequestDeploymentContext } from "@/lib/agent-discovery";
import { serverCard } from "@/lib/agent/hosted";

/** The MCP server card: where the endpoint is, for a client that found it through the catalog. */
export function GET(request: Request) {
  const { siteOrigin } = getRequestDeploymentContext(request);
  return new Response(JSON.stringify(serverCard(siteOrigin), null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/mcp-server-card+json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET",
      "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
