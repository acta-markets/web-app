import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/earn" as string | null }));

vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/solana/solana-connect-button", () => ({ SolanaConnectButton: () => null }));

import { AppNav, activeAppTab } from "./app-nav";

afterEach(() => {
  cleanup();
});

describe("activeAppTab", () => {
  it.each([
    ["/earn", "earn"],
    ["/earn/3irb63eaXBmm3bvUY7hvpFHnXzeaFZSvtsirPMsfctuS", "earn"],
    ["/trade", "trade"],
    ["/market/SOL", "trade"],
    ["/portfolio", "portfolio"],
    ["/referrals", null],
    ["/earnings", null],
    [null, null],
  ] as const)("%s highlights %s", (pathname, tab) => {
    expect(activeAppTab(pathname)).toBe(tab);
  });
});

describe("AppNav", () => {
  it("renders Earn, Trade and Portfolio as links", () => {
    nav.pathname = "/earn";
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Earn" }).getAttribute("href")).toBe("/earn");
    expect(screen.getByRole("link", { name: "Trade" }).getAttribute("href")).toBe("/trade");
    expect(screen.getByRole("link", { name: "Portfolio" }).getAttribute("href")).toBe("/portfolio");
  });

  it("keeps Trade current on a market page", () => {
    nav.pathname = "/market/SOL";
    render(<AppNav />);
    expect(screen.getByRole("link", { name: "Trade" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Earn" }).getAttribute("aria-current")).toBeNull();
  });
});
