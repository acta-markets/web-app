// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { APP_HOME, middleware } from "./middleware";

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://app.acta.markets"), { headers: { accept: "text/html", ...headers } });
const location = (res: Response) => {
  const value = res.headers.get("location");
  return value ? new URL(value).pathname + new URL(value).search : null;
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("site root", () => {
  it("sends a person straight to Trade, with a temporary redirect", () => {
    const res = middleware(request("/"));
    expect(res.status).toBe(307);
    expect(location(res)).toBe("/trade");
    expect(APP_HOME).toBe("/trade");
  });

  it("keeps the query string, so a shared link's parameters survive", () => {
    expect(location(middleware(request("/?asset=SOL&mode=yield")))).toBe("/trade?asset=SOL&mode=yield");
  });

  it("still tells agents where the site's machine-readable documents are", () => {
    expect(middleware(request("/")).headers.get("link")).toBeTruthy();
  });

  it("gives an agent that asks for markdown the home document, not a redirect", () => {
    const res = middleware(request("/", { accept: "text/markdown" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
  });

  it("leaves the landing page at the root while the app is switched off, so the closed-app redirect cannot loop", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENABLED", "false");
    const root = middleware(request("/"));
    expect(root.status).toBe(200);
    expect(root.headers.get("location")).toBeNull();
    expect(location(middleware(request("/trade")))).toBe("/?app=closed");
  });

  it("does not redirect the docs host's root", () => {
    const res = middleware(request("/", { host: "docs.acta.markets" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("leaves every other page alone", () => {
    for (const path of ["/trade", "/earn", "/portfolio", "/partners"]) {
      expect(middleware(request(path)).headers.get("location")).toBeNull();
    }
  });
});
