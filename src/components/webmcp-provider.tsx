"use client";

import { useEffect } from "react";
import { getDeploymentContext } from "@/lib/agent-discovery";

type ToolInput = Record<string, unknown>;

export interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: ToolInput) => Promise<unknown>;
}

export interface WebMcpContext {
  registerTool?: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => Promise<void>;
  provideContext?: (context: { tools: WebMcpTool[] }) => void;
}

function getModelContext(): WebMcpContext | undefined {
  const documentContext = (document as Document & { modelContext?: WebMcpContext }).modelContext;
  const legacyNavigatorContext = (navigator as Navigator & { modelContext?: WebMcpContext }).modelContext;
  return documentContext ?? legacyNavigatorContext;
}

function createTools(href: string): WebMcpTool[] {
  const context = getDeploymentContext(href);

  return [
    {
      name: "acta.describe",
      title: "Describe Acta",
      description: "Return Acta's current environment and public machine-readable resources. This is read-only.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: false,
      },
      execute: async () => ({
        protocol: "Acta structured-yield and European-style options protocol on Solana",
        environment: context.environment,
        solanaCluster: context.solanaCluster,
        site: context.siteOrigin,
        publicApi: context.apiOrigin,
        docs: `${context.siteOrigin}/docs`,
        apiCatalog: `${context.siteOrigin}/.well-known/api-catalog`,
        openapi: `${context.siteOrigin}/openapi.json`,
        authentication: `${context.siteOrigin}/auth.md`,
        tradingSafety:
          "Public discovery is read-only. Trading requires wallet authentication and explicit user review and signature of each sponsored transaction.",
      }),
    },
    {
      name: "acta.list_markets",
      title: "List Acta markets",
      description:
        "Fetch currently tradable markets from Acta's public read-only HTTP API. Optionally filter by an underlying token symbol.",
      inputSchema: {
        type: "object",
        properties: {
          underlying: {
            type: "string",
            minLength: 1,
            maxLength: 16,
            pattern: "^[A-Za-z0-9._-]+$",
            description: "Optional token symbol such as SOL or BTC.",
          },
        },
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
      execute: async (input) => {
        const underlying = typeof input.underlying === "string" ? input.underlying.trim() : "";
        if (underlying && !/^[A-Za-z0-9._-]{1,16}$/.test(underlying)) {
          throw new Error("underlying must be a token symbol of 1 to 16 safe characters");
        }

        const url = new URL("/api/v1/markets", context.apiOrigin);
        if (underlying) url.searchParams.set("underlying", underlying.toUpperCase());

        const response = await fetch(url, {
          method: "GET",
          credentials: "omit",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          throw new Error(`Acta public API returned HTTP ${response.status}`);
        }

        return response.json();
      },
    },
  ];
}

export function registerWebMcpTools(
  modelContext: WebMcpContext,
  href: string,
): (() => void) | undefined {
  const tools = createTools(href);

  if (modelContext.registerTool) {
    const controller = new AbortController();
    const registerTool = modelContext.registerTool.bind(modelContext);
    void Promise.all(
      tools.map((tool) => registerTool(tool, { signal: controller.signal })),
    ).catch(() => {
      // WebMCP is experimental. A browser may reject registration by policy
      // or because a hot reload already registered the same tool names.
    });

    return () => controller.abort();
  }

  if (modelContext.provideContext) {
    modelContext.provideContext({ tools });
    return () => modelContext.provideContext?.({ tools: [] });
  }
}

export function WebMcpProvider() {
  useEffect(() => {
    const modelContext = getModelContext();
    if (!modelContext) return;

    return registerWebMcpTools(modelContext, window.location.href);
  }, []);

  return null;
}
