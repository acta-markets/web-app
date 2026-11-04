import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuoteRequest } from "./use-quote-request";

const mocks = vi.hoisted(() => ({ context: {} as Record<string, unknown> }));
vi.mock("@/components/rfq/rfq-provider", () => ({ RFQ_TTL_SECONDS: 30, useRfqContext: () => mocks.context }));

const rfq = { market: "market", terms: { type: "cash_secured_put" as const, strike: 95e9 }, quantity: 1e9 };
const preview = {
  asset: "SOL", terms: { type: "cash_secured_put" as const, strike: 95e9 }, quantity: 1e9, underlyingDecimals: 9,
  strikeDisplay: "$95", quantityDisplay: "95 USDC",
};

beforeEach(() => {
  vi.useFakeTimers();
  mocks.context = { bestQuote: null, error: null, submitRfq: vi.fn(), cancelRfq: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("quote request lifecycle", () => {
  it("sends the RFQ with the TTL and opens the modal on the first quote", () => {
    const hook = renderHook(() => useQuoteRequest());
    act(() => hook.result.current.request(rfq, preview));
    expect(mocks.context.submitRfq).toHaveBeenCalledWith({ ...rfq, timeoutSeconds: 30 });
    expect(hook.result.current.isRequesting).toBe(true);
    expect(hook.result.current.modalProps).toMatchObject({ open: false, preview });

    mocks.context = { ...mocks.context, bestQuote: { strike: 95e9 } };
    hook.rerender();
    expect(hook.result.current.isRequesting).toBe(false);
    expect(hook.result.current.modalProps).toMatchObject({ open: true, requestNonce: 1 });

    act(() => hook.result.current.modalProps.onClose());
    expect(hook.result.current.modalProps.open).toBe(false);
  });

  it("stops waiting and reports an RFQ error", () => {
    const hook = renderHook(() => useQuoteRequest());
    act(() => hook.result.current.request(rfq, preview));
    mocks.context = { ...mocks.context, error: new Error("Market metadata is still loading.") };
    hook.rerender();
    expect(hook.result.current.isRequesting).toBe(false);
    expect(hook.result.current.failure).toEqual({ kind: "error", message: "Market metadata is still loading." });
    expect(hook.result.current.modalProps.open).toBe(false);
  });

  it("cancels the RFQ when no quote arrives within the TTL", () => {
    const hook = renderHook(() => useQuoteRequest());
    act(() => hook.result.current.request(rfq, preview));
    act(() => vi.advanceTimersByTime(29_000));
    expect(mocks.context.cancelRfq).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1_000));
    expect(mocks.context.cancelRfq).toHaveBeenCalledOnce();
    expect(hook.result.current.failure).toEqual({ kind: "timeout" });
    expect(hook.result.current.isRequesting).toBe(false);
  });

  it("cancels a pending RFQ on unmount only when asked to", () => {
    const keeps = renderHook(() => useQuoteRequest());
    act(() => keeps.result.current.request(rfq, preview));
    keeps.unmount();
    expect(mocks.context.cancelRfq).not.toHaveBeenCalled();

    const cancels = renderHook(() => useQuoteRequest({ cancelOnUnmount: true }));
    act(() => cancels.result.current.request(rfq, preview));
    cancels.unmount();
    expect(mocks.context.cancelRfq).toHaveBeenCalledOnce();
  });
});
