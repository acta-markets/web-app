import { McpServer } from "@modelcontextprotocol/server";
import { annotationsOf, SERVER_INSTRUCTIONS, toolsFor, type ToolSurface } from "./catalog";
import { toAgentError } from "./errors";
import { runTool } from "./handlers";
import type { AgentContext } from "./trade";

/**
 * The MCP server over the catalog. Building one does nothing but register tools: the context's
 * session connects on the first call, so a client that starts the server only to list its
 * tools causes no sign-in and no socket.
 */
/** Remembers a read's answer for a short while, so a busy public endpoint does not ask the venue the same thing twice. */
export type ResultCache = { get(key: string): unknown | undefined; set(key: string, value: unknown): void };

/** The AI client that runs this server, as its MCP `initialize` named itself. */
function aiClientOf(server: McpServer): string {
  const info = server.server.getClientVersion();
  return info ? `${info.name}/${info.version}` : "unknown";
}

export function buildMcpServer(
  getContext: (aiClient: string) => AgentContext | Promise<AgentContext>,
  surface: ToolSurface,
  info: { name: string; version: string },
  cache?: ResultCache,
): McpServer {
  const server = new McpServer(
    { name: info.name, version: info.version, title: "Acta" },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );
  for (const tool of toolsFor(surface)) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.input, annotations: annotationsOf(tool) },
      async (input: unknown) => {
        try {
          // Only what changes nothing is remembered, and only by what was asked.
          const key = cache && tool.effect === "read" ? `${tool.name}:${JSON.stringify(input ?? {})}` : null;
          const cached = key ? cache?.get(key) : undefined;
          const result = cached ?? (await runTool(await getContext(aiClientOf(server)), tool, input));
          if (key && cached === undefined) cache?.set(key, result);
          return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
        } catch (error) {
          const { code, message, action, details } = toAgentError(error);
          return {
            isError: true,
            content: [{ type: "text" as const, text: JSON.stringify({ error: code, message, next: action, ...(details ? { details } : {}) }) }],
          };
        }
      },
    );
  }
  return server;
}
