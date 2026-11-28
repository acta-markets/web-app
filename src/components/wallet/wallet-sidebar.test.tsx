import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WalletSidebarProvider, useWalletSidebar } from "./wallet-sidebar";

const ADDRESS = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const mocks = vi.hoisted(() => ({ solana: {} as Record<string, unknown>, push: vi.fn(), balance: vi.fn() }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => mocks.solana }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("./use-token-balance", () => ({ useTokenBalance: (...args: unknown[]) => mocks.balance(...args) }));

function Opener() {
  const { openSidebar } = useWalletSidebar();
  return <button type="button" onClick={openSidebar}>open</button>;
}
const show = () => render(<WalletSidebarProvider><Opener /></WalletSidebarProvider>);
const panel = () => screen.getByRole("dialog", { hidden: true });
const open = () => fireEvent.click(screen.getByRole("button", { name: "open" }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.balance.mockReturnValue(null);
  mocks.solana = {
    wallets: [{ name: "Phantom", icon: "/wallets/phantom.png" }, { name: "Ledger" }],
    selectedWallet: null, selectedAccount: null, isConnecting: false, isReady: true,
    connectWallet: vi.fn().mockResolvedValue(undefined), disconnectWallet: vi.fn().mockResolvedValue(undefined),
  };
});
afterEach(cleanup);

const connected = () => {
  mocks.solana = { ...mocks.solana, selectedWallet: { name: "Phantom", icon: "/wallets/phantom.png" }, selectedAccount: { address: ADDRESS } };
};

describe("wallet panel", () => {
  it("is out of reach while closed, takes focus when opened and gives it back on Escape", () => {
    show();
    expect(panel().inert).toBe(true);
    expect(panel().getAttribute("aria-hidden")).toBe("true");
    const opener = screen.getByRole("button", { name: "open" });
    opener.focus();
    open();
    expect(panel().inert).toBe(false);
    expect(panel().getAttribute("aria-label")).toBe("Connect wallet");
    expect(document.activeElement).toBe(within(panel()).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(panel().inert).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("connects the chosen wallet and closes", async () => {
    show();
    open();
    fireEvent.click(within(panel()).getByRole("button", { name: /Phantom/ }));
    await waitFor(() => expect(panel().inert).toBe(true));
    expect(mocks.solana.connectWallet).toHaveBeenCalledWith(expect.objectContaining({ name: "Phantom" }));
  });

  it.each([
    [Object.assign(new Error("User rejected the request."), { code: 4001 }), "Connection declined in Phantom."],
    [new Error("wallet is locked"), "Couldn't connect to Phantom. Unlock it and try again."],
  ])("says why a connection did not happen and stays open", async (failure, message) => {
    mocks.solana = { ...mocks.solana, connectWallet: vi.fn().mockRejectedValue(failure) };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    show();
    open();
    fireEvent.click(within(panel()).getByRole("button", { name: /Phantom/ }));
    expect((await within(panel()).findByRole("alert")).textContent).toBe(message);
    expect(panel().inert).toBe(false);
    quiet.mockRestore();
  });

  it("agrees to the terms before connecting, and does not repeat them after", () => {
    show();
    expect(panel().textContent).toContain("By connecting, you agree");
    cleanup();
    connected();
    show();
    expect(panel().textContent).not.toContain("By connecting, you agree");
  });

  it("points to wallets to install when none is found", () => {
    mocks.solana = { ...mocks.solana, wallets: [] };
    show();
    open();
    expect(within(panel()).getByText("No wallet detected")).toBeTruthy();
    expect(within(panel()).getByRole("link", { name: "Phantom" }).getAttribute("href")).toBe("https://phantom.app");
  });
});

describe("wallet menu placement", () => {
  const boxOf = (el: HTMLElement, box: Partial<DOMRect>) => {
    el.getBoundingClientRect = () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}), ...box }) as DOMRect;
  };

  it("drops down from the button that opened it, right edges together, and covers nothing else", () => {
    show();
    const opener = screen.getByRole("button", { name: "open" });
    boxOf(opener, { top: 40, bottom: 80, left: 800, right: 900 });
    fireEvent.pointerDown(opener);
    open();
    // 8px under the button, and 360 wide ending at the button's right edge
    expect(panel().style.top).toBe("88px");
    expect(panel().style.left).toBe("540px");
    expect(panel().style.width).toBe("360px");
    // a menu, not a takeover: no backdrop, nothing modal, the page still scrolls
    expect(panel().getAttribute("aria-modal")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.querySelector(".backdrop-blur-sm")).toBeNull();
  });

  it("stays inside the window when its button is at the bottom, and never opens upward", () => {
    show();
    const opener = screen.getByRole("button", { name: "open" });
    boxOf(opener, { top: 700, bottom: 752, left: 100, right: 900 });
    Object.defineProperty(panel(), "offsetHeight", { configurable: true, value: 200 });
    fireEvent.pointerDown(opener);
    open();
    // jsdom's window is 768 tall: held 12px from its bottom edge
    expect(panel().style.top).toBe(`${window.innerHeight - 200 - 12}px`);
  });

  it("is put away by a press outside it, and by its own button", () => {
    render(
      <WalletSidebarProvider>
        <Opener />
        <p>elsewhere</p>
      </WalletSidebarProvider>,
    );
    const opener = screen.getByRole("button", { name: "open" });
    fireEvent.pointerDown(opener);
    open();
    expect(panel().inert).toBe(false);
    // a press inside keeps it
    fireEvent.pointerDown(within(panel()).getByRole("button", { name: /Phantom/ }));
    expect(panel().inert).toBe(false);
    fireEvent.pointerDown(screen.getByText("elsewhere"));
    expect(panel().inert).toBe(true);
    // its own button opens it and closes it
    fireEvent.pointerDown(opener);
    open();
    expect(panel().inert).toBe(false);
    fireEvent.pointerDown(opener);
    open();
    expect(panel().inert).toBe(true);
  });
});

describe("connected wallet", () => {
  beforeEach(connected);

  it("names the wallet and shows the address once, short, with the whole of it one click away", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    show();
    open();
    const p = within(panel());
    expect(panel().getAttribute("aria-label")).toBe("Wallet");
    expect(p.getByText("Phantom")).toBeTruthy();
    expect(p.getByText("Connected")).toBeTruthy();
    expect(p.getAllByText(/7xKXtg/)).toHaveLength(1);
    expect(p.getByText("7xKXtg…osgAsU").getAttribute("title")).toBe(ADDRESS);
    await act(async () => { fireEvent.click(p.getByRole("button", { name: "Copy address" })); });
    expect(writeText).toHaveBeenCalledWith(ADDRESS);
    expect(p.getByRole("button", { name: "Copied" })).toBeTruthy();
    expect(p.getByRole("link", { name: "View on Solscan" }).getAttribute("href")).toContain(`/account/${ADDRESS}`);
  });

  it("reads balances only while it is open", () => {
    mocks.balance.mockImplementation((owner: string | undefined, _mint: string, decimals: number) => (owner ? (decimals === 6 ? 1250.5 : 3.25) : null));
    show();
    // closed: the hook is given no owner, so it reads nothing
    expect(mocks.balance.mock.calls.every(([owner]) => owner === undefined)).toBe(true);
    open();
    const balances = within(within(panel()).getByRole("region", { name: "Balances" }));
    expect(balances.getByText("1,250.50")).toBeTruthy();
    expect(balances.getByText("3.25")).toBeTruthy();
    expect(mocks.balance).toHaveBeenCalledWith(ADDRESS, expect.any(String), 6);
  });

  it("goes to referrals and closes", () => {
    show();
    open();
    fireEvent.click(within(panel()).getByRole("button", { name: /Referrals/ }));
    expect(mocks.push).toHaveBeenCalledWith("/referrals");
    expect(panel().inert).toBe(true);
  });

  it("disconnects from the panel and closes", async () => {
    show();
    open();
    fireEvent.click(within(panel()).getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(panel().inert).toBe(true));
    expect(mocks.solana.disconnectWallet).toHaveBeenCalledOnce();
  });
});
