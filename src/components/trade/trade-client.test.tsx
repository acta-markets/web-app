import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TradeClient } from "./trade-client";

const mocks = vi.hoisted(() => ({ search: "", replace: vi.fn(), getEarnSummary: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/components/rfq/rfq-provider", () => ({
  useRfqContext: () => ({ connectionState: "connected", getEarnSummary: mocks.getEarnSummary }),
}));
vi.mock("@/components/trade/easy/easy-trade", () => ({
  EasyTrade: ({ initialAsset, modeSwitch, howItWorks }: { initialAsset?: string | null; modeSwitch: ReactNode; howItWorks: ReactNode }) => (
    <div>
      {modeSwitch}
      <p>Easy for {initialAsset ?? "default"}</p>
      {howItWorks}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "";
});
afterEach(cleanup);

describe("Trade page modes", () => {
  it("opens Easy by default and fetches the earn summary", () => {
    render(<TradeClient />);
    expect(screen.getByText("Easy for default")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Easy" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tablist", { name: "Trading mode" })).toBeTruthy();
    expect(mocks.getEarnSummary).toHaveBeenCalled();
  });

  it("shows the Pro placeholder and switches back to Easy", () => {
    mocks.search = "mode=pro&asset=JLP";
    render(<TradeClient />);
    expect(screen.getByRole("heading", { name: "Pro mode is coming soon" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Easy" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP", { scroll: false });
  });

  it("keeps the other params when switching to Pro", () => {
    mocks.search = "asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Easy for JLP")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Pro" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP&mode=pro", { scroll: false });
  });

  it("explains the thesis in How it works", () => {
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByText("1) Say what you believe")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read the options guide" }).getAttribute("href")).toBe("/docs/guide/options");
  });
});
