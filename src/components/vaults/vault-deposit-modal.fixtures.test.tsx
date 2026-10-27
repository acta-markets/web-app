import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const NOW = Math.floor(Date.now() / 1000);

// fixture mode on, as with NEXT_PUBLIC_VAULTS_SAMPLE=1 in development
vi.mock("@/lib/vaults/sample", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vaults/sample")>()),
  VAULTS_SAMPLE_MODE: true,
}));
vi.mock("./use-vault-depositor", () => ({
  useVaultDepositor: () => ({ data: null, error: null, loading: false, refresh: () => {}, pending: false, actions: null }),
}));
vi.mock("./use-vaults", () => ({ useNowSecs: () => NOW }));
vi.mock("@/components/solana/solana-wallet-provider", () => ({ useSolana: () => ({ selectedAccount: null }) }));
vi.mock("@/components/wallet/wallet-sidebar", () => ({ useWalletSidebar: () => ({ openSidebar: vi.fn() }) }));
vi.mock("@/components/rfq/rfq-provider", () => ({
  useRfqContext: () => ({ referralStatus: "required", openReferralGate: vi.fn() }),
}));
vi.mock("@/components/app-ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));

import { resolveVaultMeta } from "@/lib/vaults/registry";
import { loadSampleData } from "@/lib/vaults/sample";
import { VaultDepositModal } from "./vault-deposit-modal";

afterEach(() => {
  cleanup();
});

describe("VaultDepositModal with fixture vaults", () => {
  it("reads like the real thing and completes a deposit without a wallet or a request step", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    // the app loads the JSON before any vault renders; the modal then reads it synchronously
    const data = await loadSampleData();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const vault = data.vaults.find((v) => v.vault_pda === data.keys.jitosol)!;
    render(<VaultDepositModal vault={vault} meta={resolveVaultMeta(vault, data.meta)} onClose={vi.fn()} />);

    expect(document.body.textContent).not.toMatch(/sample/i);
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redeem invite to deposit" })).toBeNull();

    await user.type(screen.getByLabelText("Deposit"), "1");
    await user.click(screen.getByRole("button", { name: "Deposit" }));
    expect(screen.getByRole("button", { name: "Submitting…" })).toBeTruthy();

    await act(() => vi.advanceTimersByTimeAsync(2_000));
    expect(screen.getByText("Deposit complete")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/sample/i);
    vi.useRealTimers();
  });
});
