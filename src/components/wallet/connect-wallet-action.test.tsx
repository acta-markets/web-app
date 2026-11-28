import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectWalletAction } from "./connect-wallet-action";

const mocks = vi.hoisted(() => ({
  openSidebar: vi.fn(),
  solana: { isConnecting: false, expectedAccount: null as { address: string } | null },
}));

vi.mock("@/components/wallet/wallet-sidebar", () => ({ useWalletSidebar: () => ({ openSidebar: mocks.openSidebar }) }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => mocks.solana }));

describe("ConnectWalletAction", () => {
  beforeEach(() => {
    mocks.openSidebar.mockReset();
    mocks.solana = { isConnecting: false, expectedAccount: null };
  });

  it("says what it does and opens the wallet panel", () => {
    render(<ConnectWalletAction />);
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet" }));
    expect(mocks.openSidebar).toHaveBeenCalledTimes(1);
  });

  it("takes the page's own words", () => {
    render(<ConnectWalletAction label="Connect wallet to see your points" />);
    expect(screen.getByRole("button", { name: "Connect wallet to see your points" })).toBeTruthy();
  });

  it("waits while the wallet's approval window is open", () => {
    mocks.solana = { isConnecting: true, expectedAccount: null };
    render(<ConnectWalletAction />);
    const button = screen.getByRole("button", { name: "Connecting..." }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("does not ask a returning wallet to connect while it reconnects", () => {
    mocks.solana = { isConnecting: false, expectedAccount: { address: "7xKX" } };
    render(<ConnectWalletAction />);
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect((screen.getByRole("button", { name: "Connecting..." }) as HTMLButtonElement).disabled).toBe(true);
  });
});
