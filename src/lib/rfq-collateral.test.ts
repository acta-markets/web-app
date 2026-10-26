import { describe, expect, it } from "vitest";
import { ActaWsRequestError } from "@acta-markets/ts-sdk/ws";
import { collateralShortfallMessage, requiredCollateralAtoms, rfqRequestErrorMessage, RFQ_REQUEST_FAILED } from "./rfq-collateral";

const sol = { symbol: "SOL", decimals: 9 };
const usdc = { symbol: "USDC", decimals: 6 };
function rejection(code: string, message: string) {
  return new Error(message, { cause: new ActaWsRequestError("request_error", "request", { type: "Generic", data: { code, message } }) });
}

describe("RFQ rejection copy", () => {
  it.each([
    [sol, "Not enough SOL to post collateral: need 0.1, have 0.000000001"],
    [usdc, "Not enough USDC to post collateral: need 100, have 0.000001"],
  ])("formats server atoms using $symbol decimals", (token, expected) => {
    expect(rfqRequestErrorMessage(rejection("insufficient_collateral", "insufficient collateral: required=100000000, available=1 (collateral atoms)"), token)).toBe(expected);
  });
  it.each(["time_overflow", "market_expired", "unknown_code"])("uses generic copy for %s", code => {
    expect(rfqRequestErrorMessage(rejection(code, "internal server detail"), sol)).toBe(RFQ_REQUEST_FAILED);
  });
  it("handles malformed amounts and connection errors without exposing raw details", () => {
    expect(rfqRequestErrorMessage(rejection("insufficient_collateral", "new server format"), sol)).toBe(RFQ_REQUEST_FAILED);
    expect(rfqRequestErrorMessage(new Error("socket disconnected"), sol)).toBe(RFQ_REQUEST_FAILED);
  });
  it("keeps u64 precision", () => {
    expect(collateralShortfallMessage(18446744073709551615n, 1n, sol)).toBe("Not enough SOL to post collateral: need 18446744073.709551615, have 0.000000001");
  });
});

describe("collateral pre-check", () => {
  it("requires the quantity in underlying atoms for calls", () => {
    expect(requiredCollateralAtoms("covered_call", 123n, [200_000_000_000n], 9, 6)).toBe(123n);
  });
  it("uses the maximum strike for puts in quote atoms", () => {
    expect(requiredCollateralAtoms("cash_secured_put", 1_500_000_000n, [150_000_000_000n, 200_000_000_000n, 100_000_000_000n], 9, 6)).toBe(300_000_000n);
  });
  it("matches server truncation and differing token decimals", () => {
    expect(requiredCollateralAtoms("cash_secured_put", 1n, [1_999_999_999n], 6, 6)).toBe(1n);
    expect(requiredCollateralAtoms("cash_secured_put", 1_000_000n, [2_000_000_000n], 6, 9)).toBe(2_000_000_000n);
  });
  it("allows an exact or surplus balance and reports a one-atom shortfall", () => {
    expect(collateralShortfallMessage(100n, 100n, usdc)).toBeNull();
    expect(collateralShortfallMessage(100n, 101n, usdc)).toBeNull();
    expect(collateralShortfallMessage(100n, 99n, usdc)).toBe("Not enough USDC to post collateral: need 0.0001, have 0.000099");
  });
});
