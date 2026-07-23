import { describe, expect, it } from "vitest";
import {
  acceptsMarkdown,
  getAuthMarkdown,
  getDeploymentContext,
  getDiscoveryLinkHeader,
  getHomeMarkdown,
  getRequestDeploymentContext,
  getRobotsText,
  getSitemapUrls,
} from "@/lib/agent-discovery";

describe("agent discovery", () => {
  it("maps devnet hosts to devnet services", () => {
    expect(getDeploymentContext("https://devnet.acta.markets/docs")).toEqual({
      environment: "devnet",
      siteOrigin: "https://devnet.acta.markets",
      apiOrigin: "https://devnet-api.acta.markets",
      websocketOrigin: "wss://devnet-api.acta.markets",
      solanaCluster: "devnet",
    });
  });

  it("maps beta hosts to mainnet-beta services", () => {
    expect(getDeploymentContext("https://beta.acta.markets/")).toEqual({
      environment: "beta",
      siteOrigin: "https://beta.acta.markets",
      apiOrigin: "https://beta-api.acta.markets",
      websocketOrigin: "wss://beta-api.acta.markets",
      solanaCluster: "mainnet-beta",
    });
  });

  it("uses the public Host header behind a local proxy", () => {
    const request = new Request("http://localhost:3000/openapi.json", {
      headers: { Host: "beta.acta.markets" },
    });

    expect(getRequestDeploymentContext(request)).toMatchObject({
      environment: "beta",
      siteOrigin: "https://beta.acta.markets",
      apiOrigin: "https://beta-api.acta.markets",
    });
  });

  it("negotiates only usable text/markdown media ranges", () => {
    expect(acceptsMarkdown("text/html, text/markdown")).toBe(true);
    expect(acceptsMarkdown("text/markdown; q=0.8, text/html")).toBe(true);
    expect(acceptsMarkdown("text/markdown;q=0")).toBe(false);
    expect(acceptsMarkdown("text/html")).toBe(false);
    expect(acceptsMarkdown(null)).toBe(false);
  });

  it("publishes explicit crawl policy and the host-specific sitemap", () => {
    const context = getDeploymentContext("https://beta.acta.markets/");
    const robots = getRobotsText(context);

    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("User-agent: Claude-Web");
    expect(robots).toContain("Content-Signal: ai-train=no, search=yes, ai-input=yes");
    expect(robots).toContain("Disallow: /portfolio");
    expect(robots).toContain("Sitemap: https://beta.acta.markets/sitemap.xml");
    expect(robots).toContain(
      "Sitemap: https://docs.acta.markets/sitemap.xml",
    );
  });

  it("lists only public canonical pages in the sitemap", () => {
    const context = getDeploymentContext("https://devnet.acta.markets/");
    expect(getSitemapUrls(context)).toEqual([
      "https://devnet.acta.markets/",
      "https://devnet.acta.markets/earn",
    ]);
  });

  it("makes environment and safety boundaries explicit in markdown", () => {
    const markdown = getHomeMarkdown(getDeploymentContext("https://beta.acta.markets/"));
    expect(markdown).toContain("Environment: beta");
    expect(markdown).toContain("https://beta-api.acta.markets");
    expect(markdown).toContain("Do not infer consent to trade");
  });

  it("documents the distinct taker and maker authentication flows", () => {
    const markdown = getAuthMarkdown(
      getDeploymentContext("https://devnet.acta.markets/"),
    );

    expect(markdown).toContain("A taker sends `StartAuth`");
    expect(markdown).toContain("a maker is challenged automatically");
    expect(markdown).toContain("Makers re-authenticate on every connection");
  });

  it("advertises registered discovery relations", () => {
    const links = getDiscoveryLinkHeader();
    expect(links).toContain('rel="api-catalog"');
    expect(links).toContain('rel="service-desc"');
    expect(links).toContain(
      '<https://docs.acta.markets>; rel="service-doc"',
    );
    expect(links).toContain('rel="describedby"');
  });
});
