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
  SentenceTrade: ({ mode, initialAsset, footer }: { mode: string; initialAsset?: string | null; footer?: ReactNode }) => (
    <div>
      <p>{mode === "profit" ? "Profit" : "Yield"} for {initialAsset ?? "default"}</p>
      {footer}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.search = "";
});
afterEach(cleanup);

describe("Trade page modes", () => {
  it("opens Profit by default and fetches the earn summary", () => {
    render(<TradeClient />);
    expect(screen.getByText("Profit for default")).toBeTruthy();
    // the mode is the one changeable word in the page title
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.textContent).toContain("on your thesis");
    expect(screen.getByRole("button", { name: "Trading mode: profit. Switch to yield" })).toBeTruthy();
    expect(mocks.getEarnSummary).toHaveBeenCalled();
  });

  it("shows Yield for ?mode=yield and switches back to Profit", () => {
    mocks.search = "mode=yield&asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Yield for JLP")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trading mode: yield. Switch to profit" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP", { scroll: false });
  });

  it("keeps the other params when switching to Yield", () => {
    mocks.search = "asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Profit for JLP")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trading mode: profit. Switch to yield" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP&mode=yield", { scroll: false });
  });

  it("sends legacy and old Profit links to the default", () => {
    mocks.search = "mode=pro";
    render(<TradeClient />);
    expect(screen.getByText("Profit for default")).toBeTruthy();
    cleanup();
    mocks.search = "mode=profit";
    render(<TradeClient />);
    expect(screen.getByText("Profit for default")).toBeTruthy();
  });

  it("explains what is behind Profit: a bought option, its premium and using it", () => {
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByRole("dialog", { name: "How profit works" })).toBeTruthy();
    expect(screen.getByText("You buy an option")).toBeTruthy();
    expect(screen.getByText(/the right, not the obligation/)).toBeTruthy();
    expect(screen.getByText(/It is the most you can lose\./)).toBeTruthy();
    // a bought option only pays if it is used, which takes a deposit
    expect(screen.getByText(/deposit before the date/)).toBeTruthy();
    expect(screen.getByText(/Above buys a call/)).toBeTruthy();
    expect(screen.queryByText("You sell an option")).toBeNull();
    expect(screen.getByRole("link", { name: "Read the guide to buying options" }).getAttribute("href")).toBe("/docs/guide/buying-options");
  });

  it("explains what is behind Yield: a sold option, the premium and the deposit backing it", () => {
    mocks.search = "mode=yield";
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(screen.getByRole("dialog", { name: "How yield works" })).toBeTruthy();
    expect(screen.getByText("You sell an option")).toBeTruthy();
    expect(screen.queryByText("You buy an option")).toBeNull();
    expect(screen.getByText(/yours either way/)).toBeTruthy();
    // what can go against the seller is said, not left to the guide
    expect(screen.getByText(/exchanged at that price, and from then on you hold what it became/)).toBeTruthy();
    expect(screen.getByText(/Above sells a put/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Read the options guide" }).getAttribute("href")).toBe("/docs/guide/options");
  });
});
