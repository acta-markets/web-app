import { getRequestDeploymentContext } from "@/lib/agent-discovery";
import { getOpenApiDocument } from "@/lib/openapi";

export function GET(request: Request) {
  const context = getRequestDeploymentContext(request);

  return new Response(JSON.stringify(getOpenApiDocument(context), null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.oai.openapi+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
