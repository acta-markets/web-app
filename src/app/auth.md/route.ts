import {
  getAuthMarkdown,
  getRequestDeploymentContext,
} from "@/lib/agent-discovery";

export function GET(request: Request) {
  const context = getRequestDeploymentContext(request);

  return new Response(getAuthMarkdown(context), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
