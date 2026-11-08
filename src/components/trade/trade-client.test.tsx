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
vi.mock("@/components/trade/sentence/sentence-trade", () => ({
  SentenceTrade: ({ mode, initialAsset, modeSwitch, howItWorks }: { mode: string; initialAsset?: string | null; modeSwitch: ReactNode; howItWorks: ReactNode }) => (
    <div>
      {modeSwitch}
      <p>{mode === "profit" ? "Profit" : "Yield"} for {initialAsset ?? "default"}</p>
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
  it("opens Yield by default and fetches the earn summary", () => {
    render(<TradeClient />);
    expect(screen.getByText("Yield for default")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Yield" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tablist", { name: "Trading mode" })).toBeTruthy();
    expect(mocks.getEarnSummary).toHaveBeenCalled();
  });

  it("shows Profit for ?mode=profit and switches back to Yield", () => {
    mocks.search = "mode=profit&asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Profit for JLP")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Yield" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP", { scroll: false });
  });

  it("keeps the other params when switching to Profit", () => {
    mocks.search = "asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Yield for JLP")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Profit" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP&mode=profit", { scroll: false });
  });

  it("treats legacy mode links as Yield", () => {
    mocks.search = "mode=pro";
    render(<TradeClient />);
    expect(screen.getByText("Yield for default")).toBeTruthy();
  });

  it("teaches the shared mechanics and the risk in How it works", () => {
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByText("Strike")).toBeTruthy();
    expect(screen.getByText("Expiry")).toBeTruthy();
    expect(screen.getByText("Max gain")).toBeTruthy();
    expect(screen.getByText("Max loss")).toBeTruthy();
  });

  it("explains the side it is on in How it works", () => {
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByText("2) Get paid now")).toBeTruthy();
    expect(screen.queryByText("2) Pay the premium")).toBeNull();
    expect(screen.getByRole("link", { name: "Read the options guide" }).getAttribute("href")).toBe("/docs/guide/options");
  });

  it("explains the premium paid in Profit's How it works", () => {
    mocks.search = "mode=profit";
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByText("2) Pay the premium")).toBeTruthy();
    expect(screen.queryByText("2) Get paid now")).toBeNull();
  });
});
