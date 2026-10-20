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
          responses: {
            "200": {
              description: "Tokens",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["tokens"],
                    properties: {
                      tokens: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Token" },
                      },
                    },
                  },
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
              name: "underlying",
              in: "query",
              required: false,
              description: "Filter by underlying mint",
              schema: { type: "string" },
            },
            {
              name: "quote",
              in: "query",
              required: false,
              description: "Filter by quote mint",
              schema: { type: "string" },
            },
            {
              name: "expiry",
              in: "query",
              required: false,
              description: "Filter by expiry, Unix seconds",
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
          ],
          responses: {
            "200": {
              description: "Markets",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["markets"],
                    properties: {
                      markets: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Market" },
                      },
                    },
                  },
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
          responses: {
            "200": {
              description: "Makers",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["makers"],
                    properties: {
                      makers: {
                        type: "array",
                        items: { $ref: "#/components/schemas/Maker" },
                      },
                    },
                  },
                },
              },
            },
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
          ],
          properties: {
            program_id: { type: "string" },
            min_quote_validity_seconds: { type: "integer" },
            settlement_buffer_seconds: { type: "integer" },
            quote_refresh_lead_seconds: { type: "integer" },
            min_rfq_timeout_seconds: { type: "integer" },
            max_rfq_timeout_seconds: { type: "integer" },
            signature_timeout_seconds: { type: "integer" },
            max_quotes_per_rfq: { anyOf: [{ type: "integer" }, { type: "null" }] },
            max_active_rfqs_per_taker: { anyOf: [{ type: "integer" }, { type: "null" }] },
            pre_expiry_cutoff_seconds: { type: "integer" },
          },
          additionalProperties: true,
        },
        Token: {
          type: "object",
          required: ["mint", "symbol", "decimals"],
          properties: {
            mint: { type: "string" },
            symbol: { type: "string" },
            decimals: { type: "integer" },
            oracle_feed_ids: { type: "array", items: { type: "string" } },
            size_rule: {
              type: "object",
              required: ["min_size", "max_size", "step"],
              properties: {
                min_size: { type: "integer", format: "int64" },
                max_size: { type: "integer", format: "int64" },
                step: { type: "integer", format: "int64" },
              },
            },
            strike_tick: { type: "integer", format: "int64" },
            quote_mints: { type: "array", items: { type: "string" } },
          },
          additionalProperties: true,
        },
        Market: {
          type: "object",
          required: ["pda", "underlying", "quote", "expiry_ts", "is_put", "status"],
          properties: {
            pda: { type: "string" },
            underlying: { type: "string", description: "Underlying mint" },
            quote: { type: "string", description: "Quote mint" },
            expiry_ts: { type: "integer", format: "int64" },
            is_put: { type: "boolean" },
            status: { type: "string", enum: ["active", "closed", "finalized"] },
            settlement_price: {
              type: "integer",
              format: "int64",
              description: "Settlement price at 1e9 scale",
            },
          },
          additionalProperties: true,
        },
        Maker: {
          type: "object",
          required: [
            "pda",
            "owner",
            "quote_signing",
            "total_trades",
            "total_volume",
            "total_quotes",
          ],
          properties: {
            pda: { type: "string" },
            owner: { type: "string" },
            quote_signing: { type: "string" },
            total_trades: { type: "integer", format: "int64" },
            total_volume: { type: "integer", format: "int64" },
            total_quotes: { type: "integer", format: "int64" },
          },
          additionalProperties: true,
        },
        Stats: {
          type: "object",
          required: [
            "total_volume_24h",
            "total_trades_24h",
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
            total_volume_24h: { type: "integer", format: "int64" },
            total_trades_24h: { type: "integer", format: "int64" },
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
