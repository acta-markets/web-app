import { describe, expect, it, vi } from "vitest";
import { fetchWalletPositions, fetchWalletPositionSummary, formatPortfolioPremium } from "./portfolio-api";

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
