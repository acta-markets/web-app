import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SAMPLE_VAULTS, buildSampleData } from "@/lib/vaults/sample";
import type { Vault } from "@/lib/vaults/types";

const NOW = 1_800_000_000;

const state = vi.hoisted(() => ({
  vaults: {
    data: [] as Vault[],
    error: null as Error | null,
    loading: false,
    refresh: () => {},
  },
}));

vi.mock("./use-vaults", () => ({
  useVaults: () => state.vaults,
  useNowSecs: () => NOW,
}));

vi.mock("./vault-deposit-modal-lazy", () => ({
  LazyVaultDepositModal: ({ vault, initialTab }: { vault: Vault; initialTab: string }) => (
    <div data-testid="vault-modal" data-pda={vault.vault_pda} data-tab={initialTab} />
  ),
  usePrefetchVaultModal: () => {},
}));

// sample vaults carry their names in the sample registry, which is off outside sample mode
vi.mock("@/lib/vaults/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vaults/registry")>();
  const { SAMPLE_VAULT_META } = await import("@/lib/vaults/sample");
  return { ...actual, resolveVaultMeta: (vault: Vault) => actual.resolveVaultMeta(vault, SAMPLE_VAULT_META) };
});

import { VaultsClient } from "./vaults-client";

const cardNames = () => screen.queryAllByRole("article").map((card) => card.getAttribute("aria-label"));

beforeEach(() => {
  state.vaults = { data: buildSampleData(NOW).vaults, error: null, loading: false, refresh: vi.fn() };
  window.history.replaceState(null, "", "/earn");
});

afterEach(() => {
  cleanup();
});

describe("VaultsClient", () => {
  it("lists proven yield first and vaults winding down last", () => {
    render(<VaultsClient initialCategory="all" />);
    const names = cardNames();
    expect(names).toHaveLength(6);
    expect(new Set(names.slice(0, 2))).toEqual(new Set(["SOL income", "USDC income"]));
    expect(names.slice(2)).toEqual([
      "jitoSOL income",
      "zBTC income",
      "xTSLA income",
      "USDC legacy",
    ]);
  });

  it("filters by category and keeps the URL shareable", async () => {
    const user = userEvent.setup();
    render(<VaultsClient initialCategory="all" />);

    await user.click(screen.getByRole("button", { name: /^Stables/ }));
    expect(cardNames()).toEqual(["USDC income", "USDC legacy"]);
    expect(window.location.search).toBe("?category=stables");

    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(cardNames()).toHaveLength(6);
    expect(window.location.search).toBe("");
  });

  it("keeps a linked category with no vaults and offers the way back", async () => {
    const user = userEvent.setup();
    render(<VaultsClient initialCategory="Other" />);
    expect(screen.getByRole("button", { name: /^Other/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Nothing in Other yet.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show all vaults" }));
    expect(cardNames()).toHaveLength(6);
  });

  it("opens deposits on Deposit, and a closing vault on Withdraw", async () => {
    const user = userEvent.setup();
    render(<VaultsClient initialCategory="all" />);

    const sol = screen.getByRole("article", { name: "SOL income" });
    await user.click(within(sol).getByRole("button", { name: "Deposit" }));
    expect(screen.getByTestId("vault-modal").dataset).toMatchObject({ pda: SAMPLE_VAULTS.sol, tab: "deposit" });

    const closing = screen.getByRole("article", { name: "USDC legacy" });
    await user.click(within(closing).getByRole("button", { name: "Manage" }));
    expect(screen.getByTestId("vault-modal").dataset).toMatchObject({ pda: SAMPLE_VAULTS.usdcClosing, tab: "withdraw" });

    expect(within(sol).getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/earn/${SAMPLE_VAULTS.sol}`);
  });

  it("shows skeletons first and a retry when nothing could load", async () => {
    const user = userEvent.setup();
    state.vaults = { data: [], error: null, loading: true, refresh: vi.fn() };
    const { rerender } = render(<VaultsClient initialCategory="all" />);
    expect(cardNames()).toHaveLength(0);

    state.vaults = { data: [], error: new Error("down"), loading: false, refresh: vi.fn() };
    rerender(<VaultsClient initialCategory="all" />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.vaults.refresh).toHaveBeenCalled();
  });
});
