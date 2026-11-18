import {
  DOCS_SITE_ORIGIN,
  type DeploymentContext,
} from "@/lib/agent-discovery";

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

const notModifiedResponse = { description: "Not modified since the ETag sent in If-None-Match" };

/** A paged list: the items under `key`, then `next_cursor` (null on the last page). */
function page(key: string, item: string) {
  return {
    type: "object",
    required: [key, "next_cursor"],
    properties: {
      [key]: { type: "array", items: { $ref: `#/components/schemas/${item}` } },
      next_cursor: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  };
}

export function getOpenApiDocument(context: DeploymentContext) {
  return {
    openapi: "3.1.0",
    info: {
      title: `Acta Public HTTP API (${context.environment})`,
      version: "1.0.0",
      description:
        "Read-only discovery and health endpoints for Acta. Trading is performed over the documented WebSocket protocol and is not part of this HTTP API.",
    },
    servers: [
      {
        url: context.apiOrigin,
        description: `${context.environment} API`,
      },
    ],
    externalDocs: {
      description: "Acta protocol documentation",
      url: DOCS_SITE_ORIGIN,
    },
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          summary: "Get service health and metadata",
          responses: {
            "200": {
              description: "Service health",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/ready": {
        get: {
          operationId: "getReadiness",
          summary: "Get service readiness",
          responses: {
            "200": {
              description: "Service is ready",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "503": errorResponse,
          },
        },
      },
      "/live": {
        get: {
          operationId: "getLiveness",
          summary: "Get process liveness",
          responses: {
            "200": {
              description: "Process is live",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/v1/venue": {
        get: {
          operationId: "getVenue",
          summary: "Get venue parameters",
          responses: {
            "200": {
              description: "Venue parameters",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Venue" },
                },
              },
            },
            "304": notModifiedResponse,
            "500": errorResponse,
          },
        },
      },
      "/api/v1/tokens": {
        get: {
          operationId: "listTokens",
          summary: "List tokens of active markets",
          parameters: [{ $ref: "#/components/parameters/Limit" }, { $ref: "#/components/parameters/Cursor" }],
          responses: {
            "200": {
              description: "Tokens, sorted by mint",
              content: {
                "application/json": {
                  schema: page("tokens", "Token"),
                },
              },
            },
            "304": notModifiedResponse,
            "503": errorResponse,
          },
        },
      },
      "/api/v1/markets": {
        get: {
          operationId: "listMarkets",
          summary: "List markets",
          parameters: [
            {
              name: "underlying_mint",
              in: "query",
              required: false,
              description: "Filter by underlying mint (base58)",
              schema: { type: "string" },
            },
            {
              name: "quote_mint",
              in: "query",
              required: false,
              description: "Filter by quote mint (base58)",
              schema: { type: "string" },
            },
            {
              name: "expiry_ts",
              in: "query",
              required: false,
              description: "Exact expiry, Unix seconds",
              schema: { type: "integer", format: "int64" },
            },
            {
              name: "is_put",
              in: "query",
              required: false,
              schema: { type: "boolean" },
            },
            {
              name: "active",
              in: "query",
              required: false,
              description: "Defaults to active markets only; false returns every market the server holds in memory",
              schema: { type: "boolean" },
            },
            { $ref: "#/components/parameters/Limit" },
            { $ref: "#/components/parameters/Cursor" },
          ],
          responses: {
            "200": {
              description: "Markets, sorted by expiry_ts then PDA",
              content: {
                "application/json": {
                  schema: page("markets", "Market"),
                },
              },
            },
            "304": notModifiedResponse,
            "500": errorResponse,
          },
        },
      },
      "/api/v1/makers": {
        get: {
          operationId: "listMakers",
          summary: "List registered makers",
          parameters: [{ $ref: "#/components/parameters/Limit" }, { $ref: "#/components/parameters/Cursor" }],
          responses: {
            "200": {
              description: "Makers, sorted by PDA",
              content: {
                "application/json": {
                  schema: page("makers", "Maker"),
                },
              },
            },
            "400": errorResponse,
            "500": errorResponse,
            "503": errorResponse,
          },
        },
      },
      "/api/v1/makers/{pda}": {
        get: {
          operationId: "getMaker",
          summary: "Get one maker",
          parameters: [{ $ref: "#/components/parameters/Pda" }],
          responses: {
            "200": {
              description: "Maker",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Maker" },
                },
              },
            },
            "400": errorResponse,
            "404": errorResponse,
            "503": errorResponse,
          },
        },
      },
      "/api/v1/stats": {
        get: {
          operationId: "getStats",
          summary: "Get public protocol statistics",
          responses: {
            "200": {
              description: "Protocol statistics",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Stats" },
                },
              },
            },
            "500": errorResponse,
            "503": errorResponse,
          },
        },
      },
    },
    components: {
      parameters: {
        Pda: {
          name: "pda",
          in: "path",
          required: true,
          description: "Solana program-derived address encoded as base58",
          schema: { type: "string" },
        },
        Limit: {
          name: "limit",
          in: "query",
          required: false,
          description: "Page size, at most the venue's max_page_size",
          schema: { type: "integer", minimum: 1 },
        },
        Cursor: {
          name: "cursor",
          in: "query",
          required: false,
          description: "The previous page's next_cursor; omit for the first page",
          schema: { type: "string" },
        },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error", "code"],
          properties: {
            error: { type: "string" },
            code: { type: "string" },
          },
        },
        Amount: {
          type: "string",
          pattern: "^(0|[1-9][0-9]*)$",
          description: "Token atoms or a 1e9-scaled value as a canonical decimal string",
        },
        Venue: {
          type: "object",
          required: [
            "program_id",
            "min_quote_validity_seconds",
            "settlement_buffer_seconds",
            "quote_refresh_lead_seconds",
            "min_rfq_timeout_seconds",
            "max_rfq_timeout_seconds",
            "signature_timeout_seconds",
            "max_quotes_per_rfq",
            "max_active_rfqs_per_taker",
            "pre_expiry_cutoff_seconds",
            "max_page_size",
            "max_batch_quotes",
          ],
          properties: {
            program_id: { type: "string" },
            min_quote_validity_seconds: { type: "integer" },
            settlement_buffer_seconds: { type: "integer" },
            quote_refresh_lead_seconds: { type: "integer" },
            min_rfq_timeout_seconds: { type: "integer" },
            max_rfq_timeout_seconds: { type: "integer" },
            signature_timeout_seconds: { type: "integer" },
            max_quotes_per_rfq: { $ref: "#/components/schemas/CountLimit" },
            max_active_rfqs_per_taker: { $ref: "#/components/schemas/CountLimit" },
            pre_expiry_cutoff_seconds: { type: "integer" },
            max_page_size: { type: "integer" },
            max_batch_quotes: { type: "integer" },
          },
          additionalProperties: true,
        },
        CountLimit: {
          oneOf: [
            { type: "object", required: ["type"], properties: { type: { const: "unlimited" } } },
            {
              type: "object",
              required: ["type", "value"],
              properties: { type: { const: "limited" }, value: { type: "integer" } },
            },
          ],
        },
        Token: {
          type: "object",
          required: ["mint", "symbol", "decimals", "oracle_feed_ids", "role", "schedule", "session", "protocol_fees"],
          properties: {
            mint: { type: "string" },
            symbol: { type: "string" },
            decimals: { type: "integer" },
            oracle_feed_ids: { type: "array", items: { type: "string" } },
            role: {
              description: "Only underlyings carry sizing and a strike grid.",
              oneOf: [
                { type: "object", required: ["type"], properties: { type: { const: "quote" } } },
                {
                  type: "object",
                  required: ["type", "size_rule", "strike_tick", "quote_mints"],
                  properties: {
                    type: { const: "underlying" },
                    size_rule: {
                      type: "object",
                      description: "Sizes min_size + k * step up to max_size, in underlying atoms",
                      required: ["min_size", "max_size", "step"],
                      properties: {
                        min_size: { $ref: "#/components/schemas/Amount" },
                        max_size: { $ref: "#/components/schemas/Amount" },
                        step: { $ref: "#/components/schemas/Amount" },
                      },
                    },
                    strike_tick: { $ref: "#/components/schemas/Amount" },
                    quote_mints: { type: "array", items: { type: "string" } },
                  },
                },
              ],
            },
            schedule: {
              description: "The price feed schedule",
              oneOf: [
                { type: "object", required: ["type"], properties: { type: { enum: ["unknown", "continuous"] } } },
                {
                  type: "object",
                  required: ["type", "spec"],
                  properties: { type: { const: "pyth" }, spec: { type: "string" } },
                },
              ],
            },
            session: {
              description: "Whether the feed trades now; times are Unix seconds",
              oneOf: [
                {
                  type: "object",
                  required: ["type"],
                  properties: { type: { enum: ["continuous", "closed_indefinitely", "unknown"] } },
                },
                {
                  type: "object",
                  required: ["type", "closes_at"],
                  properties: { type: { const: "open" }, closes_at: { type: "integer", format: "int64" } },
                },
                {
                  type: "object",
                  required: ["type", "opens_at"],
                  properties: { type: { const: "closed" }, opens_at: { type: "integer", format: "int64" } },
                },
              ],
            },
            protocol_fees: {
              oneOf: [
                {
                  type: "object",
                  required: ["type", "premium_bps", "volume_bps"],
                  properties: {
                    type: { const: "quote" },
                    premium_bps: { type: "integer" },
                    volume_bps: { type: "integer" },
                  },
                },
                {
                  type: "object",
                  required: ["type"],
                  properties: { type: { enum: ["not_quote_token", "unavailable"] } },
                },
              ],
            },
          },
          additionalProperties: true,
        },
        Market: {
          type: "object",
          required: ["pda", "underlying_mint", "quote_mint", "expiry_ts", "is_put", "status", "settlement", "products"],
          properties: {
            pda: { type: "string" },
            underlying_mint: { type: "string" },
            quote_mint: { type: "string" },
            expiry_ts: { type: "integer", format: "int64" },
            is_put: { type: "boolean" },
            status: { type: "string", enum: ["active", "closed", "finalized"] },
            settlement: {
              oneOf: [
                { type: "object", required: ["type"], properties: { type: { const: "pending" } } },
                {
                  type: "object",
                  required: ["type", "price"],
                  properties: {
                    type: { const: "fixed" },
                    price: { $ref: "#/components/schemas/Amount", description: "Settlement price, 1e9 scale" },
                  },
                },
              ],
            },
            products: {
              type: "array",
              items: { type: "string", enum: ["covered_call", "cash_secured_put", "call_spread", "put_spread", "cash_put"] },
            },
          },
          additionalProperties: true,
        },
        Maker: {
          type: "object",
          required: ["pda", "maker_owner", "quote_signing", "total_trades", "total_volume", "total_quotes"],
          properties: {
            pda: { type: "string" },
            maker_owner: { type: "string" },
            quote_signing: { type: "string" },
            total_trades: { type: "integer", format: "int64" },
            total_volume: { type: "string", description: "Exact decimal text" },
            total_quotes: { type: "integer", format: "int64" },
          },
          additionalProperties: true,
        },
        Stats: {
          type: "object",
          required: [
            "usd",
            "total_volume_24h",
            "total_trades_24h",
            "spread_trades_24h",
            "active_markets",
            "active_makers",
            "connected_makers",
          ],
          properties: {
            usd: {
              type: "object",
              description: "USD estimates captured at submission for confirmed trades; unpriced trades are excluded.",
              required: ["notional_24h", "premium_24h", "priced_trades_24h"],
              properties: {
                notional_24h: { type: "string", description: "Underlying notional in dollars, exact decimal text." },
                premium_24h: { type: "string", description: "Gross paid premium in dollars, exact decimal text." },
                priced_trades_24h: { type: "integer", minimum: 0 },
              },
            },
            total_volume_24h: { type: "string", description: "Raw aggregate, exact decimal text; not dollars" },
            total_trades_24h: { type: "integer", format: "int64" },
            spread_trades_24h: { type: "integer", format: "int64" },
            active_markets: { type: "integer", format: "int64" },
            active_makers: { type: "integer", format: "int64" },
            connected_makers: { type: "integer", format: "int64" },
          },
          additionalProperties: true,
        },
      },
    },
  };
}
