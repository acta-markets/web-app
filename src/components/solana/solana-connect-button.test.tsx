import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SolanaConnectButton, WalletButton } from "./solana-connect-button";

const ADDRESS = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const mocks = vi.hoisted(() => ({ solana: {} as Record<string, unknown>, openSidebar: vi.fn() }));
vi.mock("./solana-wallet-provider", () => ({ useSolana: () => mocks.solana }));
vi.mock("@/components/wallet/wallet-sidebar", () => ({ useWalletSidebar: () => ({ openSidebar: mocks.openSidebar }) }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.solana = { isReady: true, isConnected: false, isConnecting: false, selectedAccount: null, selectedWallet: null, disconnectWallet: vi.fn() };
});
afterEach(cleanup);

describe("WalletButton", () => {
  it("holds its place with a block, not a word, while wallets are detected", () => {
    render(<WalletButton state={{ type: "loading" }} onOpen={vi.fn()} />);
    expect(screen.getByRole("status", { name: "Checking for a wallet" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.body.textContent).toBe("");
  });

  it("offers Connect and opens the panel", () => {
    const onOpen = vi.fn();
    render(<WalletButton state={{ type: "disconnected" }} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("says it is connecting and cannot be pressed again meanwhile", () => {
    render(<WalletButton state={{ type: "connecting" }} onOpen={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Connecting…" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the wallet's mark and the short address as one button that opens the panel", () => {
    const onOpen = vi.fn();
    const { container } = render(<WalletButton state={{ type: "connected", address: ADDRESS, walletName: "Phantom", walletIcon: "/wallets/phantom.png" }} onOpen={onOpen} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("7xKX…gAsU");
    expect(buttons[0].getAttribute("aria-label")).toBe("Wallet 7xKX…gAsU, connected with Phantom. Open wallet");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/wallets/phantom.png");
    fireEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("draws its own mark for a wallet that brings no icon", () => {
    const { container } = render(<WalletButton state={{ type: "connected", address: ADDRESS, walletName: "Ledger" }} onOpen={vi.fn()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("SolanaConnectButton", () => {
  it("is a placeholder until the provider is ready", () => {
    mocks.solana = { ...mocks.solana, isReady: false };
    render(<SolanaConnectButton />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("opens the wallet panel from Connect", () => {
    render(<SolanaConnectButton />);
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(mocks.openSidebar).toHaveBeenCalledOnce();
  });

  it("follows the provider while the wallet asks for approval", () => {
    mocks.solana = { ...mocks.solana, isConnecting: true };
    render(<SolanaConnectButton />);
    expect(screen.getByRole("button", { name: "Connecting…" })).toBeTruthy();
  });

  it("never disconnects from the header: the connected button only opens the panel", () => {
    const disconnectWallet = vi.fn();
    mocks.solana = { ...mocks.solana, isConnected: true, selectedAccount: { address: ADDRESS }, selectedWallet: { name: "Phantom", icon: "/wallets/phantom.png" }, disconnectWallet };
    render(<SolanaConnectButton />);
    expect(screen.queryByRole("button", { name: /disconnect/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Wallet 7xKX…gAsU/ }));
    expect(mocks.openSidebar).toHaveBeenCalledOnce();
    expect(disconnectWallet).not.toHaveBeenCalled();
  });
});
