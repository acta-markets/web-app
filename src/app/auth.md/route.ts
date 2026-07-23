import { getAuthMarkdown, getDeploymentContext } from "@/lib/agent-discovery";

export function GET(request: Request) {
  const context = getDeploymentContext(request.url);

  return new Response(getAuthMarkdown(context), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
