import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRfqBackendUrl } from "@/lib/rfq-client";

const nav = vi.hoisted(() => ({ pathname: "/portfolio" as string | null }));
const wallet = vi.hoisted(() => ({ connected: "WalletA" as string | null, expected: null as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({
  useSolana: () => ({ selectedAccount: wallet.connected ? { address: wallet.connected } : null, expectedAccount: wallet.expected ? { address: wallet.expected } : null }),
}));

import { UnfinishedTradeNotice } from "./unfinished-trade-notice";

/** The record the order flow leaves while an accepted order has not finished. */
function leaveUnfinished(address: string) {
  const key = `acta_rfq_unfinished_order:${encodeURIComponent(getRfqBackendUrl())}:${encodeURIComponent(address)}`;
  window.localStorage.setItem(key, JSON.stringify({ orderId: "order", rfqId: "rfq", maker: "maker", originalSessionId: null, submission: "sent" }));
}

beforeEach(() => {
  nav.pathname = "/portfolio";
  wallet.connected = "WalletA";
  wallet.expected = null;
});
afterEach(cleanup);

describe("a trade that has not finished", () => {
  it("is said on other pages, with the way to it", () => {
    leaveUnfinished("WalletA");
    render(<UnfinishedTradeNotice />);
    expect(screen.getByRole("status").textContent).toContain("A trade you accepted has not finished yet.");
    expect(screen.getByRole("link", { name: "Open it on Trade" }).getAttribute("href")).toBe("/trade");
  });

  it("is not repeated on Trade, where the order itself is shown", () => {
    leaveUnfinished("WalletA");
    nav.pathname = "/trade";
    render(<UnfinishedTradeNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("is said to a returning wallet before it has reconnected", () => {
    leaveUnfinished("WalletA");
    wallet.connected = null;
    wallet.expected = "WalletA";
    render(<UnfinishedTradeNotice />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("is never said about another wallet's trade, or with no wallet", () => {
    leaveUnfinished("WalletB");
    render(<UnfinishedTradeNotice />);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    wallet.connected = null;
    render(<UnfinishedTradeNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says nothing when there is none, or when the record cannot be read as one", () => {
    render(<UnfinishedTradeNotice />);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    window.localStorage.setItem(`acta_rfq_unfinished_order:${encodeURIComponent(getRfqBackendUrl())}:WalletA`, "not json");
    render(<UnfinishedTradeNotice />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
