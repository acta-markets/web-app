import { expect, test } from "@playwright/test";

test.describe("agent discovery HTTP contracts", () => {
  test("serves robots and sitemap", async ({ request }) => {
    const [robots, sitemap] = await Promise.all([
      request.get("/robots.txt"),
      request.get("/sitemap.xml"),
    ]);

    expect(robots.status()).toBe(200);
    expect(robots.headers()["content-type"]).toContain("text/plain");
    expect(await robots.text()).toContain(
      "Sitemap: http://localhost:3000/sitemap.xml",
    );

    expect(sitemap.status()).toBe(200);
    expect(sitemap.headers()["content-type"]).toContain("application/xml");
    expect(await sitemap.text()).not.toContain(
      "<loc>http://localhost:3000/docs</loc>",
    );
    expect(await robots.text()).toContain(
      "Sitemap: https://docs.acta.markets/sitemap.xml",
    );
  });

  test("publishes a deployment-aware API catalog and OpenAPI document", async ({ request }) => {
    const [catalogResponse, openApiResponse] = await Promise.all([
      request.get("/.well-known/api-catalog"),
      request.get("/openapi.json"),
    ]);

    expect(catalogResponse.status()).toBe(200);
    expect(catalogResponse.headers()["content-type"]).toContain(
      "application/linkset+json",
    );
    const catalog = await catalogResponse.json();
    expect(catalog.linkset[0].anchor).toBe("https://devnet-api.acta.markets");
    expect(catalog.linkset[0]["service-doc"][0].href).toBe(
      "https://docs.acta.markets",
    );

    expect(openApiResponse.status()).toBe(200);
    expect(openApiResponse.headers()["content-type"]).toContain(
      "application/vnd.oai.openapi+json",
    );
    const openapi = await openApiResponse.json();
    expect(openapi.openapi).toBe("3.1.0");
    expect(openapi.servers[0].url).toBe("https://devnet-api.acta.markets");
    expect(openapi.paths["/api/v1/markets"].get.operationId).toBe("listMarkets");
  });

  test("negotiates homepage markdown while keeping HTML as the default", async ({ request }) => {
    const [markdownResponse, htmlResponse] = await Promise.all([
      request.get("/", {
        headers: { Accept: "text/markdown" },
      }),
      request.get("/", {
        headers: { Accept: "text/html" },
      }),
    ]);

    expect(markdownResponse.status()).toBe(200);
    expect(markdownResponse.headers()["content-type"]).toContain("text/markdown");
    expect(markdownResponse.headers()["vary"]).toContain("Accept");
    expect(markdownResponse.headers()["link"]).toContain('rel="api-catalog"');
    expect(await markdownResponse.text()).toContain("Environment: devnet");

    expect(htmlResponse.status()).toBe(200);
    expect(htmlResponse.headers()["content-type"]).toContain("text/html");
    expect(htmlResponse.headers()["link"]).toContain('rel="service-doc"');
    expect(await htmlResponse.text()).toContain("<!DOCTYPE html>");
  });

  test("serves agent skill artifacts with correct media types", async ({ request }) => {
    const [indexResponse, skillResponse] = await Promise.all([
      request.get("/.well-known/agent-skills/index.json"),
      request.get("/.well-known/agent-skills/use-acta-public-api/SKILL.md"),
    ]);

    expect(indexResponse.status()).toBe(200);
    expect(indexResponse.headers()["content-type"]).toContain("application/json");
    expect((await indexResponse.json()).skills[0].name).toBe("use-acta-public-api");

    expect(skillResponse.status()).toBe(200);
    expect(skillResponse.headers()["content-type"]).toContain("text/markdown");
    expect(await skillResponse.text()).toContain("# Use Acta Public API");
  });

  test("serves self-hosted docs as HTML and source Markdown", async ({ request }) => {
    const [htmlResponse, markdownResponse, referenceResponse] = await Promise.all([
      request.get("/docs", { headers: { Accept: "text/html" } }),
      request.get("/docs", { headers: { Accept: "text/markdown" } }),
      request.get("/docs/reference/http-api"),
    ]);

    expect(htmlResponse.status()).toBe(200);
    expect(htmlResponse.headers()["content-type"]).toContain("text/html");
    expect(await htmlResponse.text()).toContain("Acta Protocol");

    expect(markdownResponse.status()).toBe(200);
    expect(markdownResponse.headers()["content-type"]).toContain("text/markdown");
    expect(markdownResponse.headers()["content-location"]).toBe(
      "https://docs.acta.markets",
    );
    expect(await markdownResponse.text()).toContain("# Acta Protocol");

    expect(referenceResponse.status()).toBe(200);
    expect(await referenceResponse.text()).toContain("HTTP API");
  });

  test("serves clean canonical paths on the docs host", async ({ request }) => {
    const headers = { Host: "docs.acta.markets" };
    const [home, markdown, robots, sitemap, llms] = await Promise.all([
      request.get("/", { headers: { ...headers, Accept: "text/html" } }),
      request.get("/reference/http-api", {
        headers: { ...headers, Accept: "text/markdown" },
      }),
      request.get("/robots.txt", { headers }),
      request.get("/sitemap.xml", { headers }),
      request.get("/llms.txt", { headers }),
    ]);

    expect(home.status()).toBe(200);
    expect(home.headers()["link"]).toContain('rel="service-doc"');
    expect(await home.text()).toContain("Acta Protocol");
    expect(markdown.headers()["content-type"]).toContain("text/markdown");
    expect(markdown.headers()["content-location"]).toBe(
      "https://docs.acta.markets/reference/http-api",
    );
    expect(await robots.text()).toContain(
      "Sitemap: https://docs.acta.markets/sitemap.xml",
    );
    expect(await sitemap.text()).toContain(
      "<loc>https://docs.acta.markets/reference/http-api</loc>",
    );
    expect(await llms.text()).toContain(
      "https://docs.acta.markets/reference/http-api",
    );
  });

});
