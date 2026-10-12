"use client";

import { useEffect } from "react";
import {
  DOCS_SITE_ORIGIN,
  getDeploymentContext,
} from "@/lib/agent-discovery";

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
        docs: DOCS_SITE_ORIGIN,
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
        "Fetch currently tradable markets from Acta's public read-only HTTP API. Optionally filter by an underlying token mint; /api/v1/tokens maps mints to symbols.",
      inputSchema: {
        type: "object",
        properties: {
          underlying: {
            type: "string",
            minLength: 32,
            maxLength: 44,
            pattern: "^[1-9A-HJ-NP-Za-km-z]+$",
            description: "Optional underlying token mint address, base58.",
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
        if (underlying && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(underlying)) {
          throw new Error("underlying must be a base58 token mint address");
        }

        const url = new URL("/api/v1/markets", context.apiOrigin);
        if (underlying) url.searchParams.set("underlying", underlying);

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
