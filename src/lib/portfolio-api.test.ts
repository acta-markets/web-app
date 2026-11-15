import { describe, expect, it, vi } from "vitest";
import { fetchWalletPositions, fetchWalletPositionSummary, formatPortfolioPremium, portfolioPremiumInLastDays, type WalletPositionSummary } from "./portfolio-api";

describe("wallet portfolio WS API", () => {
  it("sends the tagged cursor and isolates history from live state", async () => {
    const client = { getPositionsPageAsync: vi.fn().mockResolvedValue({ positions: [], next_cursor: null }), getPositionSummaryAsync: vi.fn() };
    await fetchWalletPositions(client, { settled: true, limit: 50, cursor: "opaque" });
    expect(client.getPositionsPageAsync).toHaveBeenCalledWith(expect.objectContaining({ status: ["settled", "liquidated"], limit: 50, cursor: { type: "after", id: "opaque" } }), { applyToState: false });
  });
  it("propagates a summary failure instead of returning empty totals", async () => {
    const client = { getPositionsPageAsync: vi.fn(), getPositionSummaryAsync: vi.fn().mockRejectedValue(new Error("unavailable")) };
    await expect(fetchWalletPositionSummary(client)).rejects.toThrow("unavailable");
  });
});

it("formats quote atoms without dropping precision or merging currencies", () => {
  expect(formatPortfolioPremium("9007199254740993", 6, "USDC")).toBe("$9,007,199,254.74");
  expect(formatPortfolioPremium("1000000001", 9, "SOL")).toBe("1.00 SOL");
  expect(formatPortfolioPremium("0", 6, "USDC")).toBe("$0.00");
});

describe("portfolioPremiumInLastDays", () => {
  const now = Date.parse("2026-11-16T15:00:00Z") / 1000;
  const summary = (daily: WalletPositionSummary["daily"]): WalletPositionSummary => ({ quote_mint: "usdc", quote_decimals: 6, premium_all_time: "0", premium_30d: "0", open_positions: 0, daily });

  it("adds up today and the six days before for a week", () => {
    const daily = [
      { day: "2026-11-08", premium: "1000000" }, // nine days back: out
      { day: "2026-11-09", premium: "2000000" }, // its day began more than seven days ago: out
      { day: "2026-11-10", premium: "4000000" }, // in
      { day: "2026-11-13", premium: "8000000" }, // in
      { day: "2026-11-16", premium: "16000000" }, // today: in
    ];
    expect(portfolioPremiumInLastDays(summary(daily), 7, now)).toBe("28000000");
    expect(portfolioPremiumInLastDays(summary(daily), 30, now)).toBe("31000000");
  });

  it("is zero without buckets in range, and exact above Number.MAX_SAFE_INTEGER", () => {
    expect(portfolioPremiumInLastDays(summary([]), 7, now)).toBe("0");
    expect(portfolioPremiumInLastDays(summary([{ day: "2026-10-01", premium: "5" }]), 7, now)).toBe("0");
    expect(portfolioPremiumInLastDays(summary([{ day: "2026-11-15", premium: "9007199254740993" }, { day: "2026-11-16", premium: "2" }]), 7, now)).toBe("9007199254740995");
  });

  it("does not count a bucket dated after now", () => {
    expect(portfolioPremiumInLastDays(summary([{ day: "2026-11-17", premium: "5" }]), 7, now)).toBe("0");
  });
});
