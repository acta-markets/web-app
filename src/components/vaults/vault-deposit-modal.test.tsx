import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VaultDepositorState } from "@/lib/vaults/depositor";
import { LAST_SHARES_COPY, REQUEST_EXISTS_COPY } from "@/lib/vaults/presentation";
import { resolveVaultMeta } from "@/lib/vaults/registry";
import { makeVault } from "@/lib/vaults/sample";
import type { Vault } from "@/lib/vaults/types";

const NOW = 1_800_000_000;
const SOL = 1_000_000_000n;

const env = vi.hoisted(() => ({
  wallet: null as { address: string } | null,
  referralStatus: "redeemed" as "unknown" | "required" | "redeemed",
  openReferralGate: (() => {}) as () => void,
  openSidebar: (() => {}) as () => void,
  show: (() => {}) as (message: string, variant?: string) => void,
  depositor: null as unknown as {
    data: VaultDepositorState | null;
    error: Error | null;
    loading: boolean;
    refresh: () => void;
    pending: boolean;
    actions: Record<string, (...args: unknown[]) => Promise<string>> | null;
  },
}));

vi.mock("./use-vault-depositor", () => ({
  useVaultDepositor: () => env.depositor,
}));
vi.mock("./use-vaults", () => ({
  useNowSecs: () => NOW,
}));
vi.mock("@/components/solana/solana-wallet-provider", () => ({
  useSolana: () => ({ selectedAccount: env.wallet }),
}));
vi.mock("@/components/wallet/wallet-sidebar", () => ({
  useWalletSidebar: () => ({ openSidebar: env.openSidebar }),
}));
vi.mock("@/components/rfq/rfq-provider", () => ({
  useRfqContext: () => ({ referralStatus: env.referralStatus, openReferralGate: env.openReferralGate }),
}));
vi.mock("@/components/app-ui/toast", () => ({
  useToast: () => ({ show: env.show }),
}));

import { VaultDepositModal } from "./vault-deposit-modal";

const SOL_MINT = "So11111111111111111111111111111111111111112";

function solVault(overrides: Partial<Vault> = {}): Vault {
  return makeVault({
    vault_pda: "pda-sol",
    main_mint: SOL_MINT,
    main_decimals: 9,
    phase: "idle",
    accepting_deposits: true,
    equity: (1000n * SOL).toString(),
    total_shares: (1000n * SOL).toString(),
    live_share_supply: (1000n * SOL).toString(),
    ...overrides,
  });
}

function position(overrides: Partial<VaultDepositorState> = {}): VaultDepositorState {
  return {
    depositRequest: null,
    withdrawRequest: null,
    shareBalance: 0n,
    mainTokenBalance: 0n,
    nativeLamports: 5n * SOL,
    ...overrides,
  };
}

function renderModal(vault = solVault(), initialTab: "deposit" | "withdraw" = "deposit") {
  const meta = resolveVaultMeta(vault, { [vault.vault_pda]: { name: "SOL test vault", curator: "Acta" } });
  const onTransaction = vi.fn();
  render(<VaultDepositModal vault={vault} meta={meta} initialTab={initialTab} onClose={vi.fn()} onTransaction={onTransaction} />);
  return { onTransaction };
}

const cta = (name: string | RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

beforeEach(() => {
  env.wallet = { address: "Wallet111111111111111111111111111111111111" };
  env.referralStatus = "redeemed";
  env.openReferralGate = vi.fn();
  env.openSidebar = vi.fn();
  env.show = vi.fn();
  env.depositor = {
    data: position(),
    error: null,
    loading: false,
    refresh: vi.fn(),
    pending: false,
    actions: {
      requestDeposit: vi.fn().mockResolvedValue("sig-deposit"),
      requestWithdraw: vi.fn().mockResolvedValue("sig-withdraw"),
      cancelDeposit: vi.fn().mockResolvedValue("sig-cancel"),
      cancelWithdraw: vi.fn().mockResolvedValue("sig-cancel-w"),
      emergencyRefund: vi.fn().mockResolvedValue("sig-refund"),
      processOwnDeposit: vi.fn().mockResolvedValue("sig-process"),
      processOwnWithdraw: vi.fn().mockResolvedValue("sig-process-w"),
    },
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("VaultDepositModal", () => {
  it("asks for a wallet before anything else", async () => {
    const user = userEvent.setup();
    env.wallet = null;
    renderModal();
    expect(screen.queryByRole("region", { name: "Your position" })).toBeNull();
    await user.click(cta("Connect wallet"));
    expect(env.openSidebar).toHaveBeenCalled();
  });

  it("sends new deposits through the invite gate but never withdrawals", async () => {
    const user = userEvent.setup();
    env.referralStatus = "required";
    env.depositor.data = position({ shareBalance: 10n * SOL });
    renderModal();

    await user.click(cta("Redeem invite to deposit"));
    expect(env.openReferralGate).toHaveBeenCalled();
    expect(env.depositor.actions!.requestDeposit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Withdraw" }));
    expect(cta("Enter an amount").disabled).toBe(true);
  });

  it("keeps SOL back for fees and refuses more than the wallet holds", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.type(screen.getByLabelText("Deposit"), "4.995");
    expect(cta("Not enough SOL").disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "MAX" }));
    expect((screen.getByLabelText("Deposit") as HTMLInputElement).value).toBe("4.99");
    expect(cta("Request deposit").disabled).toBe(false);
  });

  it("requests a deposit and reports it", async () => {
    const user = userEvent.setup();
    const { onTransaction } = renderModal();
    await user.type(screen.getByLabelText("Deposit"), "1.5");
    await user.click(cta("Request deposit"));

    await waitFor(() => expect(env.depositor.actions!.requestDeposit).toHaveBeenCalledWith(1_500_000_000n));
    expect(env.show).toHaveBeenCalledWith("Deposit requested", "success");
    expect(onTransaction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /View on Solscan/ }).getAttribute("href")).toContain("/tx/sig-deposit");
  });

  it("allows one pending request at a time and lets it be cancelled", async () => {
    const user = userEvent.setup();
    env.depositor.data = position({ depositRequest: { amount: 2n * SOL, createdAt: BigInt(NOW - 60) } });
    renderModal();

    expect(screen.getByText(REQUEST_EXISTS_COPY.deposit)).toBeTruthy();
    expect(cta("Request deposit").disabled).toBe(true);
    expect(screen.getByText("Pending deposit: 2 SOL")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(env.depositor.actions!.cancelDeposit).toHaveBeenCalled());
  });

  it("allows requesting the vault's last live shares", async () => {
    const user = userEvent.setup();
    env.depositor.data = position({ shareBalance: 900n * SOL });
    renderModal(solVault({ live_share_supply: String(900n * SOL) }), "withdraw");
    await user.click(screen.getByRole("button", { name: "MAX" }));
    expect(screen.getByText(LAST_SHARES_COPY)).toBeTruthy();
    expect(cta("Request withdrawal").disabled).toBe(false);
    await user.click(cta("Request withdrawal"));
    expect(env.depositor.actions!.requestWithdraw).toHaveBeenCalledWith(900n * SOL);
  });

  it("explains why a closing vault takes no deposits", () => {
    renderModal(solVault({ safety: "closing" }));
    expect(screen.getByText("This vault is closing. It only processes withdrawals now.")).toBeTruthy();
    expect(cta("Request deposit").disabled).toBe(true);
  });

  it("does not ask for a wallet or an invite when the vault itself is closed to deposits", () => {
    env.wallet = null;
    env.referralStatus = "required";
    renderModal(solVault({ safety: "closing" }));
    expect(screen.getByText("This vault is closing. It only processes withdrawals now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redeem invite to deposit" })).toBeNull();
  });

  it("treats a declined signature as information, not an error", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => {});
    env.depositor.actions!.requestDeposit = vi.fn().mockRejectedValue(new Error("User rejected the request."));
    renderModal();
    await user.type(screen.getByLabelText("Deposit"), "1");
    await user.click(cta("Request deposit"));

    expect(await screen.findByText("Request declined in your wallet. Nothing was sent.")).toBeTruthy();
    expect(env.show).not.toHaveBeenCalled();
  });
});
