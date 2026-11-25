import { createMcpHandler } from "@modelcontextprotocol/server";
import { getRequestDeploymentContext } from "@/lib/agent-discovery";
import { afterBody, hostedContext, HOSTED_SERVER, rateLimiter, shortCache } from "@/lib/agent/hosted";
import { buildMcpServer } from "@/lib/agent/mcp";

/**
 * The site's MCP endpoint (Streamable HTTP, stateless): the read-only tools, for any client,
 * with no sign-in. It holds no key. Trading runs in the server an agent's owner starts on
 * their own machine (`packages/mcp`), never here.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Mcp-Protocol-Version",
};

// The venue's data moves every few seconds at most; a public endpoint need not ask more often.
const cache = shortCache(15_000);
const allow = rateLimiter(120, 60_000);

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function caller(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function serve(request: Request): Promise<Response> {
  // The tools read devnet. On any other deployment there is nothing true to serve.
  if (getRequestDeploymentContext(request).environment !== "devnet") {
    return withCors(Response.json({ error: "not_available", message: "Acta's MCP endpoint is on devnet: https://devnet.acta.markets/mcp" }, { status: 404 }));
  }
  if (!allow(caller(request))) {
    return withCors(Response.json({ error: "rate_limited", message: "Too many requests. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } }));
  }
  // One context per request. Its tools read over HTTP; the session is closed when the reply has
  // been read to its end. An older client is answered with a stream that starts before the tool
  // finishes, so closing when the handler returns would cut the tool off.
  const context = hostedContext();
  const close = () => context.session.close();
  const handler = createMcpHandler(() => buildMcpServer(() => context, "hosted", HOSTED_SERVER, cache), { responseMode: "json" });
  try {
    return afterBody(await handler.fetch(request), close, CORS);
  } catch (error) {
    close();
    throw error;
  }
}

export const POST = serve;
// GET and DELETE are session operations this stateless endpoint does not have; the handler says so.
export const GET = serve;
export const DELETE = serve;

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}
