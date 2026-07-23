import type { DeploymentContext } from "@/lib/agent-discovery";

const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

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
      url: `${context.siteOrigin}/docs`,
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
      "/api/v1/markets": {
        get: {
          operationId: "listMarkets",
          summary: "List currently tradable markets",
          parameters: [
            {
              name: "underlying",
              in: "query",
              required: false,
              description: "Filter by underlying symbol",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Tradable markets",
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
            "500": errorResponse,
            "503": errorResponse,
          },
        },
      },
      "/api/v1/markets/{pda}": {
        get: {
          operationId: "getMarket",
          summary: "Get one market",
          parameters: [{ $ref: "#/components/parameters/Pda" }],
          responses: {
            "200": {
              description: "Market",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/Market" },
                },
              },
            },
            "400": errorResponse,
            "404": errorResponse,
            "503": errorResponse,
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
        Market: {
          type: "object",
          required: [
            "pda",
            "underlying_mint",
            "quote_mint",
            "expiry_ts",
            "is_put",
            "is_finalized",
          ],
          properties: {
            pda: { type: "string" },
            underlying_mint: { type: "string" },
            quote_mint: { type: "string" },
            expiry_ts: { type: "integer", format: "int64" },
            is_put: { type: "boolean" },
            is_finalized: { type: "boolean" },
            settlement_price: {
              anyOf: [
                { type: "integer", format: "int64" },
                { type: "null" },
              ],
              description: "Settlement price at 1e9 scale",
            },
            underlying_symbol: { type: "string" },
            quote_symbol: { type: "string" },
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
