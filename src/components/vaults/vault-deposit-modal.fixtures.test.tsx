import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
import { SAMPLE_VAULTS, SAMPLE_VAULT_META, sampleData } from "@/lib/vaults/sample";
import { VaultDepositModal } from "./vault-deposit-modal";

afterEach(() => {
  cleanup();
});

describe("VaultDepositModal with fixture vaults", () => {
  it("reads like the real thing and never sends anything", async () => {
    const user = userEvent.setup();
    const vault = sampleData().vaults.find((v) => v.vault_pda === SAMPLE_VAULTS.jitosol)!;
    render(
      <VaultDepositModal vault={vault} meta={resolveVaultMeta(vault, SAMPLE_VAULT_META)} onClose={vi.fn()} />,
    );

    expect(document.body.textContent).not.toMatch(/sample/i);
    expect(screen.queryByRole("button", { name: "Connect wallet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Redeem invite to deposit" })).toBeNull();

    await user.type(screen.getByLabelText("Deposit"), "1");
    const cta = screen.getByRole("button", { name: "Request deposit" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(document.body.textContent).not.toMatch(/sample/i);
  });
});
