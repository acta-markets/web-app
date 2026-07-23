import { getDeploymentContext, getRobotsText } from "@/lib/agent-discovery";
import {
  getDocsRobotsText,
  isDocsRequest,
} from "@/lib/docs-content";

export function GET(request: Request) {
  const context = getDeploymentContext(request.url);
  const body = isDocsRequest(request)
    ? getDocsRobotsText()
    : getRobotsText(context);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
