// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import {
  registerWebMcpTools,
  type WebMcpContext,
  type WebMcpTool,
} from "@/components/webmcp-provider";

describe("WebMCP registration", () => {
  it("registers current WebMCP tools as read-only and unregisters with AbortSignal", async () => {
    const registrations: Array<{ tool: WebMcpTool; signal?: AbortSignal }> = [];
    const modelContext: WebMcpContext = {
      registerTool: vi.fn(async (tool, options) => {
        registrations.push({ tool, signal: options?.signal });
      }),
    };

    const cleanup = registerWebMcpTools(
      modelContext,
      "https://beta.acta.markets/",
    );
    await Promise.resolve();

    expect(registrations.map(({ tool }) => tool.name)).toEqual([
      "acta.describe",
      "acta.list_markets",
    ]);
    expect(registrations.every(({ tool }) => tool.annotations.readOnlyHint)).toBe(true);

    const description = await registrations[0].tool.execute({});
    expect(description).toMatchObject({
      environment: "beta",
      publicApi: "https://beta-api.acta.markets",
    });

    cleanup?.();
    expect(registrations.every(({ signal }) => signal?.aborted)).toBe(true);
  });

  it("supports the legacy provideContext shape without exposing trade actions", () => {
    const provideContext = vi.fn();
    const cleanup = registerWebMcpTools(
      { provideContext },
      "https://devnet.acta.markets/",
    );

    const tools = provideContext.mock.calls[0][0].tools as WebMcpTool[];
    expect(tools.map((tool) => tool.name)).toEqual([
      "acta.describe",
      "acta.list_markets",
    ]);
    expect(tools.some((tool) => /trade|sign|submit/i.test(tool.name))).toBe(false);

    cleanup?.();
    expect(provideContext).toHaveBeenLastCalledWith({ tools: [] });
  });
});
