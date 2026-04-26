import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type CtxShape = {
  isAuthenticated: boolean;
  redeemInvite: ReturnType<typeof vi.fn>;
  referralError: string | null;
  referralStatus: "unknown" | "required" | "redeemed";
  clearReferralError: ReturnType<typeof vi.fn>;
};

const ctxState = vi.hoisted(() => ({
  current: null as unknown as CtxShape,
}));

const refStore = vi.hoisted(() => ({ pending: null as string | null }));

vi.mock("@/components/rfq/rfq-provider", () => ({
  useRfqContext: () => ctxState.current,
}));

vi.mock("@/components/app-ui/app-button", () => ({
  AppButton: ({
    children,
    ...rest
  }: React.PropsWithChildren<React.ButtonHTMLAttributes<HTMLButtonElement>>) => (
    <button {...rest}>{children}</button>
  ),
}));

vi.mock("@/lib/rfq-client", () => ({
  normalizeReferralCode: (s: string) =>
    String(s).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16),
}));

vi.mock("@/components/referral/ref-capture", () => ({
  readPendingRefCode: () => refStore.pending,
  clearPendingRefCode: () => {
    refStore.pending = null;
  },
  RefCapture: () => null,
}));

const freshCtx = (): CtxShape => ({
  isAuthenticated: false,
  redeemInvite: vi.fn(),
  referralError: null,
  referralStatus: "required",
  clearReferralError: vi.fn(),
});

beforeEach(() => {
  refStore.pending = null;
  ctxState.current = freshCtx();
  // Re-evaluate the form module so its module-scoped urlRefAutoAttempted resets.
  vi.resetModules();
});

afterEach(() => {
  cleanup();
});

async function loadForm() {
  const mod = await import("./redeem-invite-form");
  return mod.RedeemInviteForm;
}

const inputValue = () =>
  (screen.getByLabelText("Invite code") as HTMLInputElement).value;
const buttonText = () =>
  (screen.getByRole("button").textContent ?? "").trim();

describe("RedeemInviteForm", () => {
  it("auto-submits a code captured from URL once authenticated", async () => {
    refStore.pending = "ACTA";
    ctxState.current.isAuthenticated = true;
    const Form = await loadForm();

    render(<Form />);

    await waitFor(() => {
      expect(ctxState.current.redeemInvite).toHaveBeenCalledTimes(1);
    });
    expect(ctxState.current.redeemInvite).toHaveBeenCalledWith("ACTA");
    expect(inputValue()).toBe("ACTA");
  });

  it("does NOT auto-submit when the user types the code manually", async () => {
    ctxState.current.isAuthenticated = true;
    const Form = await loadForm();

    render(<Form />);

    await userEvent.type(screen.getByLabelText("Invite code"), "ACTA");

    // Give React a tick for any (unwanted) effect to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(ctxState.current.redeemInvite).not.toHaveBeenCalled();
  });

  it("does NOT auto-submit if the user edits a URL-pre-filled code before auth", async () => {
    refStore.pending = "ACTA";
    ctxState.current.isAuthenticated = false;
    const Form = await loadForm();

    const { rerender } = render(<Form />);

    // Pre-fill from pending.
    await waitFor(() => {
      expect(inputValue()).toBe("ACTA");
    });
    expect(ctxState.current.redeemInvite).not.toHaveBeenCalled();

    // User edits before auth completes — code is no longer URL-derived.
    await userEvent.type(screen.getByLabelText("Invite code"), "2");
    expect(inputValue()).toBe("ACTA2");

    // Auth completes.
    ctxState.current = { ...ctxState.current, isAuthenticated: true };
    rerender(<Form />);

    await new Promise((r) => setTimeout(r, 50));
    expect(ctxState.current.redeemInvite).not.toHaveBeenCalled();
  });

  it("does not double-fire auto-submit on remount (strict-mode safe)", async () => {
    refStore.pending = "ACTA";
    ctxState.current.isAuthenticated = true;
    const Form = await loadForm();

    const first = render(<Form />);
    await waitFor(() => {
      expect(ctxState.current.redeemInvite).toHaveBeenCalledTimes(1);
    });
    first.unmount();

    refStore.pending = "ACTA"; // simulate the same URL ref still in storage
    render(<Form />);
    await new Promise((r) => setTimeout(r, 50));

    expect(ctxState.current.redeemInvite).toHaveBeenCalledTimes(1);
  });

  it("shows 'Redeem invite' (not 'Redeeming…') when a server error appears", async () => {
    refStore.pending = "ACTA";
    ctxState.current.isAuthenticated = true;
    const Form = await loadForm();

    const { rerender } = render(<Form />);
    await waitFor(() => {
      expect(ctxState.current.redeemInvite).toHaveBeenCalledTimes(1);
    });

    // While the request is in flight the button shows the busy label.
    expect(buttonText()).toBe("Redeeming...");

    // Server replies with an error; submitting may still be true for one tick,
    // but the button must immediately show the actionable label.
    ctxState.current = {
      ...ctxState.current,
      referralError: "We couldn't find that invite code.",
    };
    rerender(<Form />);

    expect(buttonText()).toBe("Redeem invite");
    expect((screen.getByRole("alert").textContent ?? "").trim()).toBe(
      "We couldn't find that invite code."
    );
  });

  it("manual submit works for a typed code (no URL pending)", async () => {
    ctxState.current.isAuthenticated = true;
    const Form = await loadForm();

    render(<Form />);

    await userEvent.type(screen.getByLabelText("Invite code"), "BETA");

    expect(ctxState.current.redeemInvite).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button"));
    expect(ctxState.current.redeemInvite).toHaveBeenCalledOnce();
    expect(ctxState.current.redeemInvite).toHaveBeenCalledWith("BETA");
  });
});
