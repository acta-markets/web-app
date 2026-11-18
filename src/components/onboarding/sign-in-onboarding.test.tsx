import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rfq = vi.hoisted(() => ({
  value: {
    connectionState: "connected" as string,
    isAuthenticated: false,
    error: null as Error | null,
    authenticate: vi.fn(() => Promise.resolve()),
    referralStatus: "unknown" as string,
    referralInfo: null as { status: "pending" | "active" } | null,
    signInNeedsSignature: true,
    signInError: null as string | null,
    sessionElsewhere: false,
  },
}));
const wallet = vi.hoisted(() => ({ address: "WalletA" as string | null }));
const balance = vi.hoisted(() => ({ usdc: null as number | null }));
const season = vi.hoisted(() => ({ load: vi.fn(async () => null as unknown) }));
const nav = vi.hoisted(() => ({ pathname: "/trade" as string | null, push: vi.fn() }));

vi.mock("@/components/rfq/rfq-provider", () => ({ useRfqContext: () => rfq.value }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: nav.push }) }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({
  useSolana: () => ({ isConnected: wallet.address !== null, selectedAccount: wallet.address ? { address: wallet.address } : null, signMessage: vi.fn() }),
}));
vi.mock("@/components/wallet/use-token-balance", () => ({
  useTokenBalance: (owner: string | undefined, mint: string) => (owner && mint.startsWith("So1") ? null : owner ? balance.usdc : null),
}));
vi.mock("@/lib/rewards/source", () => ({ loadSeason: season.load }));

import { SignInOnboarding } from "./sign-in-onboarding";

function set(next: Partial<typeof rfq.value>) {
  rfq.value = { ...rfq.value, ...next };
}

/** Moves the fake connection on and lets the modal's timers and effects run. */
async function go(view: ReturnType<typeof render>, next: Partial<typeof rfq.value>, ms = 0) {
  set(next);
  view.rerender(<SignInOnboarding />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const dialog = () => screen.queryByRole("dialog");

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  wallet.address = "WalletA";
  nav.pathname = "/trade";
  nav.push.mockClear();
  balance.usdc = null;
  season.load.mockResolvedValue(null);
  rfq.value = { connectionState: "connected", isAuthenticated: false, error: null, authenticate: vi.fn(() => Promise.resolve()), referralStatus: "unknown", referralInfo: null, signInNeedsSignature: true, signInError: null, sessionElsewhere: false };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("signing in", () => {
  it("shows nothing for a session that resumes before the prompt's delay", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 300);
    expect(dialog()).toBeNull();
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } }, 5000);
    expect(dialog()).toBeNull();
  });

  it("asks for the signature once the wallet is taking its time, and lists what follows for a new wallet", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    expect(dialog()?.getAttribute("aria-label")).toBe("Sign in with your wallet");
    expect(screen.getByText(/It is a signature only: it costs nothing and moves no funds/)).toBeTruthy();
    expect(screen.getByText("Test funds in your wallet")).toBeTruthy();
  });

  it("closes by itself for a wallet that has traded before", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "active" } });
    expect(dialog()).toBeNull();
  });

  it("turns into the welcome for a wallet that has never traded, with funds arriving until the chain shows them", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true });
    expect(screen.getByText("Signed in. One moment.")).toBeTruthy();
    await go(view, { referralInfo: { status: "pending" } });
    expect(dialog()?.getAttribute("aria-label")).toBe("You are signed in");
    expect(screen.getByText("Arriving. This can take a minute.")).toBeTruthy();
    expect(screen.getByText(/Devnet: test funds only/)).toBeTruthy();
    balance.usdc = 10000;
    await go(view, {});
    expect(screen.getByText("10,000 USDC")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Make your first trade" }).getAttribute("href")).toBe("/trade");
  });

  it("does not take a status left over from before this sign-in as news", async () => {
    set({ referralInfo: { status: "pending" } });
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true });
    expect(screen.getByText("Signed in. One moment.")).toBeTruthy();
  });

  it("gives up quietly when the wallet's status never arrives", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true }, 4100);
    expect(dialog()).toBeNull();
  });

  it("welcomes a wallet once: closing it is remembered", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).toBeNull();
    // the same wallet signs in again later
    await go(view, { connectionState: "connected", isAuthenticated: false });
    await go(view, { connectionState: "authenticating" }, 900);
    expect(screen.queryByText("Test funds in your wallet")).toBeNull();
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } });
    expect(dialog()).toBeNull();
  });

  it("leaves the screen to the invite gate", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralStatus: "required", referralInfo: { status: "pending" } });
    expect(dialog()).toBeNull();
  });

  it("names a live league in the welcome when a season is running", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { sampleSeason } = await vi.importActual<typeof import("@/lib/rewards/sample-season")>("@/lib/rewards/sample-season");
    const running = sampleSeason(now);
    season.load.mockResolvedValue(running);
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } }, 50);
    expect(screen.getByText(new RegExp(`${running.leagues[1].name} is open until`))).toBeTruthy();
    expect(screen.getByRole("link", { name: "See rewards" }).getAttribute("href")).toBe("/rewards");
  });
});

describe("where a first sign-in lands", () => {
  it("takes a new trader to Trade, once, and keeps the welcome up", async () => {
    nav.pathname = "/rewards";
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    expect(nav.push).not.toHaveBeenCalled();
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } });
    expect(nav.push).toHaveBeenCalledTimes(1);
    expect(nav.push).toHaveBeenCalledWith("/trade");
    nav.pathname = "/trade";
    await go(view, {});
    expect(dialog()?.getAttribute("aria-label")).toBe("You are signed in");
    expect(nav.push).toHaveBeenCalledTimes(1);
  });

  it("moves nobody who is already on Trade", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } });
    expect(dialog()?.getAttribute("aria-label")).toBe("You are signed in");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("leaves a returning trader where they signed in", async () => {
    nav.pathname = "/portfolio";
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "active" } });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("leaves a wallet already welcomed on this browser where it signed in", async () => {
    nav.pathname = "/rewards";
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    nav.push.mockClear();
    await go(view, { connectionState: "connected", isAuthenticated: false });
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } });
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("a sign-in that did not happen", () => {
  it("says so and offers another go, even when it was refused before the prompt went up", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 200);
    await go(view, { connectionState: "disconnected", signInError: "User rejected the request." });
    expect(dialog()?.getAttribute("aria-label")).toBe("Sign-in was not completed");
    expect(screen.getByText(/The message was declined in your wallet\. You are not signed in/)).toBeTruthy();
  });

  it("signs in again from Try again, and keeps the prompt up while it does", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "disconnected", signInError: "RFQ auth timeout" });
    expect(screen.getByText(/Your wallet did not answer in time/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(rfq.value.authenticate).toHaveBeenCalledWith("WalletA", expect.any(Function));
    await go(view, { connectionState: "authenticating", signInError: null });
    expect(dialog()?.getAttribute("aria-label")).toBe("Sign in with your wallet");
  });

  it("reports a retry that could not even start", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "disconnected", signInError: "declined" });
    rfq.value.authenticate.mockRejectedValueOnce(new Error("RFQ connection is unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/The sign-in did not go through/)).toBeTruthy();
  });

  it("is not a failure when the wallet was disconnected or switched mid-way", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    wallet.address = null;
    await go(view, { connectionState: "disconnected" });
    expect(dialog()).toBeNull();

    wallet.address = "WalletA";
    await go(view, { connectionState: "connected" });
    await go(view, { connectionState: "authenticating" }, 900);
    wallet.address = "WalletB";
    await go(view, { connectionState: "disconnected" });
    expect(dialog()).toBeNull();
  });

  it("stays closed once closed", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "disconnected", signInError: "declined" });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).toBeNull();
  });
});

describe("resuming a stored session", () => {
  it("prompts for nothing, however long it takes, and welcomes nobody", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating", signInNeedsSignature: false }, 5_000);
    expect(dialog()).toBeNull();
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "pending" } }, 5_000);
    expect(dialog()).toBeNull();
  });

  it("prompts once the server refuses the session and a signature is needed after all", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating", signInNeedsSignature: false }, 2_000);
    expect(dialog()).toBeNull();
    await go(view, { signInNeedsSignature: true }, 900);
    expect(dialog()?.getAttribute("aria-label")).toBe("Sign in with your wallet");
  });
});

describe("a session taken over by another tab", () => {
  it("is said, with a way to take it back here", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticated", isAuthenticated: true });
    await go(view, { connectionState: "disconnected", isAuthenticated: false, sessionElsewhere: true });
    expect(dialog()?.getAttribute("aria-label")).toBe("This wallet is active elsewhere");
    fireEvent.click(screen.getByRole("button", { name: "Use it here" }));
    expect(rfq.value.authenticate).toHaveBeenCalledWith("WalletA", expect.any(Function));
  });

  it("is not mistaken for a failed sign-in, and can be closed", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticated", isAuthenticated: true });
    await go(view, { connectionState: "disconnected", isAuthenticated: false, sessionElsewhere: true });
    expect(screen.queryByText(/was not completed/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialog()).toBeNull();
  });

  it("is not shown once the wallet is gone", async () => {
    const view = render(<SignInOnboarding />);
    wallet.address = null;
    await go(view, { connectionState: "disconnected", sessionElsewhere: true });
    expect(dialog()).toBeNull();
  });
});

describe("a sign-in that is still on its way", () => {
  it("is not called failed when the connection reports other states before it completes", async () => {
    // a resume starts before the server's welcome; the welcome then reports "connected"
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating", signInNeedsSignature: false }, 100);
    await go(view, { connectionState: "connected" }, 2_000);
    expect(dialog()).toBeNull();
    await go(view, { connectionState: "authenticated", isAuthenticated: true, referralInfo: { status: "active" } }, 2_000);
    expect(dialog()).toBeNull();
  });

  it("is not called failed when the connection drops and comes back by itself", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "authenticating" }, 900);
    await go(view, { connectionState: "disconnected" }, 500);
    expect(screen.queryByText(/was not completed/)).toBeNull();
  });

  it("does not carry one wallet's failure over to the next wallet", async () => {
    const view = render(<SignInOnboarding />);
    await go(view, { connectionState: "disconnected", signInError: "declined" });
    expect(dialog()?.getAttribute("aria-label")).toBe("Sign-in was not completed");
    wallet.address = "WalletB";
    await go(view, { connectionState: "connected", signInError: null });
    expect(dialog()).toBeNull();
  });
});
