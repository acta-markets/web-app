import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { VaultDepositorState } from "@/lib/vaults/depositor";
import { makeVault } from "@/lib/vaults/sample";
import type { VaultDepositorEvent } from "@/lib/vaults/types";

const env = vi.hoisted(() => ({
  history: vi.fn(),
  performance: vi.fn(),
}));

vi.mock("@/lib/vaults/source", () => ({ loadVaultDepositorHistory: env.history }));
vi.mock("@acta-markets/ts-sdk/http", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@acta-markets/ts-sdk/http")>();
  env.performance.mockImplementation(actual.depositorPerformance);
  return { ...actual, depositorPerformance: env.performance };
});

import { VaultPositionPanel } from "./vault-position-panel";

const NOW = 1_800_000_000;
const WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC = 1_000_000n;

const deposit = (shares: bigint, price: string, time: number): VaultDepositorEvent => ({
  vault: "v",
  action: "deposit_processed",
  amount: "0",
  second_amount: "0",
  shares: shares.toString(),
  boundary_price: price,
  event_time: String(time),
  transaction_signature: `sig${time}`,
});

const state = (overrides: Partial<VaultDepositorState> = {}): VaultDepositorState => ({
  depositRequest: null,
  withdrawRequest: null,
  shareBalance: 300n * USDC,
  mainTokenBalance: 0n,
  nativeLamports: null,
  ...overrides,
});

function renderPanel(generationStart: string | null, position = state()) {
  const vault = makeVault({ vault_pda: "v", share_price: "1100000000", generation_started_at: generationStart });
  return render(
    <VaultPositionPanel
      vault={vault}
      symbol="USDC"
      state={position}
      wallet={WALLET}
      error={null}
      nowSecs={NOW}
      actionsEnabled
      busy={false}
      onAction={() => {}}
      onRetry={() => {}}
    />,
  );
}

afterEach(() => {
  cleanup();
  env.history.mockReset();
  env.performance.mockClear();
});

describe("VaultPositionPanel", () => {
  it("feeds the wallet's history, shares in escrow and the generation start to the SDK", async () => {
    // newest first, like the API: 100 shares at 1.00, then 200 at 1.10
    env.history.mockResolvedValue([deposit(200n * USDC, "1100000000", NOW - 100), deposit(100n * USDC, "1000000000", NOW - 200)]);
    renderPanel(String(NOW - 1_000), state({ shareBalance: 250n * USDC, withdrawRequest: { shares: 50n * USDC, createdAt: 0n } }));

    expect(await screen.findByText("+3.33%")).toBeTruthy();
    expect(env.history).toHaveBeenCalledWith("v", WALLET, BigInt(NOW - 1_000), expect.any(AbortSignal));
    expect(env.performance).toHaveBeenLastCalledWith({
      history: expect.any(Array),
      shares: 300n * USDC,
      sharePrice: "1100000000",
      generationStart: String(NOW - 1_000),
    });
    expect(screen.getByText("330 USDC")).toBeTruthy();
    expect(screen.getByText("300 shares")).toBeTruthy();
  });

  it("omits the return when the vault has no generation start, and on a failed history read", async () => {
    renderPanel(null);
    expect(screen.getByText("330 USDC")).toBeTruthy();
    expect(env.history).not.toHaveBeenCalled();
    cleanup();

    env.history.mockRejectedValue(new Error("down"));
    renderPanel(String(NOW - 1_000));
    await waitFor(() => expect(env.history).toHaveBeenCalled());
    expect(screen.queryByText(/Since entry/)).toBeNull();
  });
});
