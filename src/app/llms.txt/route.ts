import { getDeploymentContext, getLlmsText } from "@/lib/agent-discovery";
import { getDocsLlmsText, isDocsRequest } from "@/lib/docs-content";

export function GET(request: Request) {
  const context = getDeploymentContext(request.url);
  const body = isDocsRequest(request)
    ? getDocsLlmsText()
    : getLlmsText(context);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
