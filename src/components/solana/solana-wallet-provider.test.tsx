import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWallets } from "@wallet-standard/core";
import { getRfqBackendUrl } from "@/lib/rfq-client";
import { readSessionId, writeSession } from "@/lib/state/session-store";
import { clearLastWallet, readLastWallet, writeLastWallet } from "@/lib/wallet-memory";
import { SolanaWalletProvider, useSolana } from "./solana-wallet-provider";

type Account = { address: string; publicKey: Uint8Array };

/** A wallet-standard wallet that hands out `granted` on a prompt, and on a silent ask only when `trusted`. */
function fakeWallet(name: string, granted: Account[], { trusted }: { trusted: boolean }) {
  const wallet = {
    version: "1.0.0" as const,
    name,
    icon: "data:image/png;base64,AA==" as const,
    chains: ["solana:devnet"] as const,
    accounts: [] as Account[],
    features: {
      "standard:connect": {
        version: "1.0.0",
        connect: vi.fn(async (input?: { silent?: boolean }) => {
          if (!input?.silent || trusted) wallet.accounts = granted;
          return { accounts: wallet.accounts };
        }),
      },
      "standard:disconnect": {
        version: "1.0.0",
        disconnect: vi.fn(async () => {
          wallet.accounts = [];
        }),
      },
    },
  };
  return wallet;
}

const account = (address: string): Account => ({ address, publicKey: new Uint8Array(32) });
const unregister: Array<() => void> = [];
function register(wallet: ReturnType<typeof fakeWallet>) {
  unregister.push(getWallets().register(wallet as never));
}

let api: ReturnType<typeof useSolana>;
function Probe() {
  api = useSolana();
  return (
    <p>
      {api.isReady ? "ready" : "loading"} {api.selectedAccount?.address ?? "nobody"} last:{api.lastWalletName ?? "none"}
      <span data-testid="expected">{api.expectedAccount?.address ?? "nobody"}</span>
    </p>
  );
}

const forget = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/state/keys", () => ({ forgetWallet: forget }));

const mount = () =>
  render(
    <SolanaWalletProvider>
      <Probe />
    </SolanaWalletProvider>,
  );

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  while (unregister.length) unregister.pop()?.();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("coming back with a remembered wallet", () => {
  it("reconnects it silently, on the account used last time", async () => {
    const wallet = fakeWallet("Phantom", [account("First"), account("Second")], { trusted: true });
    register(wallet);
    writeLastWallet({ name: "Phantom", address: "Second" });
    mount();
    await screen.findByText("ready Second last:Phantom");
    expect(wallet.features["standard:connect"].connect).toHaveBeenCalledTimes(1);
    expect(wallet.features["standard:connect"].connect).toHaveBeenCalledWith({ silent: true });
    expect(api.isConnected).toBe(true);
  });

  it("reconnects a wallet that registers after the page has loaded", async () => {
    writeLastWallet({ name: "Backpack", address: "Late" });
    mount();
    await screen.findByText("ready nobody last:Backpack");
    const wallet = fakeWallet("Backpack", [account("Late")], { trusted: true });
    act(() => register(wallet));
    await screen.findByText("ready Late last:Backpack");
  });

  it("uses the wallet's first account when the remembered one is gone, and remembers that instead", async () => {
    register(fakeWallet("Phantom", [account("Other")], { trusted: true }));
    writeLastWallet({ name: "Phantom", address: "Gone" });
    mount();
    await screen.findByText("ready Other last:Phantom");
    expect(readLastWallet()).toEqual({ name: "Phantom", address: "Other" });
  });

  it("stays disconnected, and keeps the memory, when the wallet no longer trusts the site", async () => {
    const wallet = fakeWallet("Phantom", [account("First")], { trusted: false });
    register(wallet);
    writeLastWallet({ name: "Phantom", address: "First" });
    mount();
    await waitFor(() => expect(wallet.features["standard:connect"].connect).toHaveBeenCalledWith({ silent: true }));
    await screen.findByText("ready nobody last:Phantom");
    expect(api.isConnecting).toBe(false);
    expect(readLastWallet()).toEqual({ name: "Phantom", address: "First" });
  });

  it("stays disconnected when the wallet refuses the silent ask outright", async () => {
    const wallet = fakeWallet("Phantom", [account("First")], { trusted: false });
    wallet.features["standard:connect"].connect.mockRejectedValue(new Error("locked"));
    register(wallet);
    writeLastWallet({ name: "Phantom", address: "First" });
    mount();
    await screen.findByText("ready nobody last:Phantom");
    await waitFor(() => expect(api.isConnecting).toBe(false));
  });

  it("asks once per page load, however many wallets register afterwards", async () => {
    const wallet = fakeWallet("Phantom", [account("First")], { trusted: false });
    register(wallet);
    writeLastWallet({ name: "Phantom", address: "First" });
    mount();
    await screen.findByText("ready nobody last:Phantom");
    act(() => register(fakeWallet("Solflare", [account("X")], { trusted: true })));
    await waitFor(() => expect(api.wallets).toHaveLength(2));
    expect(wallet.features["standard:connect"].connect).toHaveBeenCalledTimes(1);
  });
});

describe("with nothing remembered", () => {
  it("asks no wallet for anything", async () => {
    const wallet = fakeWallet("Phantom", [account("First")], { trusted: true });
    register(wallet);
    mount();
    await screen.findByText("ready nobody last:none");
    expect(wallet.features["standard:connect"].connect).not.toHaveBeenCalled();
  });
});

describe("connecting and leaving by hand", () => {
  it("remembers the wallet on connect: its name and public address only", async () => {
    register(fakeWallet("Phantom", [account("First")], { trusted: false }));
    mount();
    await screen.findByText("ready nobody last:none");
    await act(() => api.connectWallet(api.wallets[0]));
    await screen.findByText("ready First last:Phantom");
    expect(readLastWallet()).toEqual({ name: "Phantom", address: "First" });
    expect(Object.keys(JSON.parse(window.localStorage.getItem("acta_last_wallet")!).d)).toEqual(["name", "address"]);
  });

  it("forgets the wallet on disconnect, so the next visit does not reconnect it", async () => {
    const wallet = fakeWallet("Phantom", [account("First")], { trusted: true });
    register(wallet);
    writeLastWallet({ name: "Phantom", address: "First" });
    const first = mount();
    await screen.findByText("ready First last:Phantom");
    await act(() => api.disconnectWallet());
    await screen.findByText("ready nobody last:none");
    expect(readLastWallet()).toBeNull();
    first.unmount();
    wallet.features["standard:connect"].connect.mockClear();
    mount();
    await screen.findByText("ready nobody last:none");
    expect(wallet.features["standard:connect"].connect).not.toHaveBeenCalled();
  });

  it("does not let a silent reconnect override a wallet the visitor has just chosen", async () => {
    const slow = fakeWallet("Phantom", [account("Old")], { trusted: true });
    let release: () => void = () => {};
    slow.features["standard:connect"].connect.mockImplementation(async (input?: { silent?: boolean }) => {
      if (input?.silent) await new Promise<void>((resolve) => (release = resolve));
      slow.accounts = [account("Old")];
      return { accounts: slow.accounts };
    });
    register(slow);
    register(fakeWallet("Solflare", [account("Chosen")], { trusted: false }));
    writeLastWallet({ name: "Phantom", address: "Old" });
    mount();
    await waitFor(() => expect(api.wallets).toHaveLength(2));
    await act(() => api.connectWallet(api.wallets.find((w) => w.name === "Solflare")!));
    await act(async () => release());
    await screen.findByText("ready Chosen last:Solflare");
  });
});

describe("the wallet the app expects back", () => {
  const expected = () => screen.getByTestId("expected").textContent;

  it("is the remembered one from the first paint, until it is connected", async () => {
    const wallet = fakeWallet("Phantom", [account("First")], { trusted: true });
    let release: () => void = () => {};
    wallet.features["standard:connect"].connect.mockImplementation(async () => {
      await new Promise<void>((resolve) => (release = resolve));
      wallet.accounts = [account("First")];
      return { accounts: wallet.accounts };
    });
    register(wallet);
    writeLastWallet({ name: "Phantom", address: "First" });
    mount();
    expect(expected()).toBe("First");
    await waitFor(() => expect(api.isReady).toBe(true));
    expect(expected()).toBe("First");
    await act(async () => release());
    await screen.findByText(/ready First/);
    expect(expected()).toBe("nobody");
  });

  it("is nobody when nothing is remembered", async () => {
    mount();
    expect(expected()).toBe("nobody");
    await screen.findByText(/ready nobody/);
    expect(expected()).toBe("nobody");
  });

  it("stops being expected when the wallet declines the silent reconnect", async () => {
    register(fakeWallet("Phantom", [account("First")], { trusted: false }));
    writeLastWallet({ name: "Phantom", address: "First" });
    mount();
    await waitFor(() => expect(expected()).toBe("nobody"));
    expect(api.isConnected).toBe(false);
  });

  it("is given up on when its extension has not announced itself shortly after the page is ready", async () => {
    vi.useFakeTimers();
    try {
      writeLastWallet({ name: "Backpack", address: "Late" });
      mount();
      await act(async () => { await vi.advanceTimersByTimeAsync(10); });
      expect(expected()).toBe("Late");
      await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
      expect(expected()).toBe("nobody");
    } finally { vi.useRealTimers(); }
  });
});

describe("disconnecting", () => {
  it("signs the wallet out on this device and forgets its saved data", async () => {
    register(fakeWallet("Phantom", [account("First")], { trusted: true }));
    writeLastWallet({ name: "Phantom", address: "First" });
    writeSession(getRfqBackendUrl(), "First", "session", 4_000_000_000);
    writeSession(getRfqBackendUrl(), "Other", "other-session", 4_000_000_000);
    mount();
    await screen.findByText(/ready First/);
    forget.mockClear();
    await act(() => api.disconnectWallet());
    expect(readSessionId(getRfqBackendUrl(), "First")).toBeNull();
    expect(readSessionId(getRfqBackendUrl(), "Other")).toBe("other-session");
    expect(forget).toHaveBeenCalledWith("First");
  });

  it("in another tab disconnects this one too", async () => {
    register(fakeWallet("Phantom", [account("First")], { trusted: true }));
    writeLastWallet({ name: "Phantom", address: "First" });
    mount();
    await screen.findByText(/ready First/);
    forget.mockClear();
    // the other tab forgot the wallet; this tab hears of it through storage
    act(() => clearLastWallet());
    await screen.findByText(/ready nobody/);
    expect(forget).toHaveBeenCalledWith("First");
  });
});
