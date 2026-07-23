import { getDeploymentContext, getLlmsText } from "@/lib/agent-discovery";

export function GET(request: Request) {
  const context = getDeploymentContext(request.url);

  return new Response(getLlmsText(context), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
