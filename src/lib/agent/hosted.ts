import { devnetConfig } from "./config";
import { memoryJournal } from "./journal";
import type { ResultCache } from "./mcp";
import { ActaSession } from "./session";
import type { AgentContext } from "./trade";

/**
 * The site's own MCP endpoint: the tools that need no wallet, for an agent with no key. It
 * holds no key, signs nothing and keeps no session between requests.
 */

export const HOSTED_SERVER = { name: "acta", version: "0.1.0" } as const;
/** The card's name: the site's domain reversed, then the server. */
export const HOSTED_CARD_NAME = "markets.acta/acta";
export const HOSTED_DESCRIPTION = "Read Acta's options markets and yield vaults on Solana devnet. No key, no sign-in.";

/**
 * A context for one request: an anonymous session that is closed when the request ends. A
 * socket kept between requests would go stale while the function is frozen.
 */
export function hostedContext(clientVersion: string = HOSTED_SERVER.version): AgentContext {
  return {
    session: new ActaSession(devnetConfig({ clientName: "acta-site-mcp", clientVersion }), null, { autoReconnect: false }),
    // nothing here can move funds; the limits say so as well
    limits: { readOnly: true, maxTradeUsd: 0, dailyUsd: 0, allowedAssets: [] },
    journal: memoryJournal(),
    placing: false,
  };
}

/** Answers kept for `ttlMs`, at most `max` of them; the oldest goes first. */
export function shortCache(ttlMs: number, max = 200, now: () => number = Date.now): ResultCache {
  const entries = new Map<string, { at: number; value: unknown }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() - entry.at >= ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (entries.size >= max) entries.delete(entries.keys().next().value as string);
      entries.set(key, { at: now(), value });
    },
  };
}

/** At most `limit` calls per caller in each `windowMs`. Per server instance: a floor against a loop, not a quota. */
export function rateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const callers = new Map<string, { from: number; count: number }>();
  return (caller: string): boolean => {
    const at = now();
    if (callers.size > 5_000) callers.clear();
    const seen = callers.get(caller);
    if (!seen || at - seen.from >= windowMs) {
      callers.set(caller, { from: at, count: 1 });
      return true;
    }
    seen.count += 1;
    return seen.count <= limit;
  };
}

/**
 * Runs `done` once, when the response's body has been read to its end, was cancelled or
 * failed. A reply to an older client is a stream that starts before the tool has finished, so
 * "the handler returned" is not "the request is over": whatever the tool is using must live
 * until the body ends.
 */
export function afterBody(response: Response, done: () => void, headers: Record<string, string> = {}): Response {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    done();
  };
  const merged = new Headers(response.headers);
  for (const [name, value] of Object.entries(headers)) merged.set(name, value);
  const init = { status: response.status, statusText: response.statusText, headers: merged };
  if (!response.body) {
    finish();
    return new Response(null, init);
  }
  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done: ended, value } = await reader.read();
        if (ended) {
          finish();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        finish();
        controller.error(error);
      }
    },
    async cancel(reason) {
      finish();
      await reader.cancel(reason).catch(() => {});
    },
  });
  return new Response(body, init);
}

/** What the server card says: where the endpoint is and nothing about what it holds. */
export function serverCard(siteOrigin: string) {
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: HOSTED_CARD_NAME,
    title: "Acta",
    description: HOSTED_DESCRIPTION,
    version: HOSTED_SERVER.version,
    websiteUrl: `${siteOrigin}/agent`,
    repository: { url: "https://github.com/acta-markets/web-app", source: "github", subfolder: "packages/mcp" },
    remotes: [{ type: "streamable-http", url: `${siteOrigin}/mcp` }],
  };
}

/** The domain's catalog of agent-facing things: one entry, pointing at the card. */
export function aiCatalog(siteOrigin: string) {
  return {
    specVersion: "0.9",
    host: { displayName: "Acta", documentationUrl: `${siteOrigin}/agent` },
    entries: [
      {
        identifier: "urn:air:acta.markets:acta:mcp",
        type: "application/mcp-server-card+json",
        url: `${siteOrigin}/mcp/server-card`,
      },
    ],
  };
}
