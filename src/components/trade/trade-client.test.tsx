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
    expect(screen.getByRole("button", { name: "Trading mode: profit. Switch to shield" })).toBeTruthy();
    // the line under the title says what this mode is; the other mode's line only holds its space
    expect(screen.getByText("If you are wrong, you lose what you pay now, never more").getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("If you are wrong, you buy or sell the asset at your price").getAttribute("aria-hidden")).toBe("true");
    expect(mocks.getEarnSummary).toHaveBeenCalled();
  });

  it("shows Yield for ?mode=yield and switches back to Profit", () => {
    mocks.search = "mode=yield&asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Yield for JLP")).toBeTruthy();
    expect(screen.getByText("If you are wrong, you buy or sell the asset at your price").getAttribute("aria-hidden")).toBe("false");
    expect(screen.getByText("If you are wrong, you lose what you pay now, never more").getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Trading mode: yield. Switch to profit" }));
    expect(mocks.replace).toHaveBeenCalledWith("/trade?asset=JLP", { scroll: false });
  });

  it("keeps the other params when switching to Yield", () => {
    mocks.search = "asset=JLP";
    render(<TradeClient />);
    expect(screen.getByText("Profit for JLP")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Trading mode: profit. Switch to shield" }));
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

  it("sends How it works, under the card, to the guide for the mode on screen", () => {
    render(<TradeClient />);
    expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/docs/guide/buying-options");
    // no modal any more: the explanation lives in the docs
    expect(screen.queryByRole("button", { name: "How it works" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sends How it works to the options guide in Yield", () => {
    mocks.search = "mode=yield";
    render(<TradeClient />);
    expect(screen.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/docs/guide/options");
  });
});

describe("the mode a visitor last used", () => {
  it("opens for an address that names none, such as the nav link's", async () => {
    const { tradeDraftStore, updateTradeDraft } = await import("@/lib/trade/draft");
    updateTradeDraft(tradeDraftStore(), { mode: "yield" });
    render(<TradeClient />);
    expect(screen.getByText("Yield for default")).toBeTruthy();
  });

  it("gives way to the mode the address names", async () => {
    const { tradeDraftStore, updateTradeDraft } = await import("@/lib/trade/draft");
    updateTradeDraft(tradeDraftStore(), { mode: "yield" });
    mocks.search = "mode=profit";
    render(<TradeClient />);
    expect(screen.getByText("Profit for default")).toBeTruthy();
  });

  it("is remembered when it is switched", async () => {
    const { tradeDraftStore } = await import("@/lib/trade/draft");
    render(<TradeClient />);
    fireEvent.click(screen.getByRole("button", { name: "Trading mode: profit. Switch to shield" }));
    expect(tradeDraftStore().read().mode).toBe("yield");
    expect(screen.getByText("Yield for default")).toBeTruthy();
  });
});
