import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getTokenMint } from "@/lib/tokens";
import { makePerformance, makeVault, parseSampleData } from "@/lib/vaults/sample";
import sampleFile from "@/lib/vaults/sample-data.json";
import type { Vault } from "@/lib/vaults/types";

const NOW = 1_800_000_000;
const SAMPLE = parseSampleData(sampleFile, NOW);

// not in the sample set: a vault that only takes withdrawals now, with the best APY on paper
const CLOSING = makeVault({
  vault_pda: "Wind1ngDown111111111111111111111111111111111",
  main_mint: getTokenMint("USDC")!,
  safety: "closing",
  performance: makePerformance({ apy_30d: 60 }),
});

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

// fixture vaults carry their names in sample-data.json, which the registry only reads in fixture mode
vi.mock("@/lib/vaults/registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/vaults/registry")>();
  const { parseSampleData } = await import("@/lib/vaults/sample");
  const file = (await import("@/lib/vaults/sample-data.json")).default;
  const { meta } = parseSampleData(file, file.anchor);
  return { ...actual, resolveVaultMeta: (vault: Vault) => actual.resolveVaultMeta(vault, meta) };
});

import { VaultsClient } from "./vaults-client";

const cardNames = () => screen.queryAllByRole("article").map((card) => card.getAttribute("aria-label"));
const card = (name: string) => within(screen.getByRole("article", { name }));

beforeEach(() => {
  state.vaults = { data: SAMPLE.vaults, error: null, loading: false, refresh: vi.fn() };
  window.history.replaceState(null, "", "/earn");
});

afterEach(() => {
  cleanup();
});

describe("VaultsClient", () => {
  it("lists the highest proven APY first and vaults winding down last", () => {
    state.vaults = { ...state.vaults, data: [CLOSING, ...SAMPLE.vaults] };
    render(<VaultsClient initialCategory="all" />);
    expect(cardNames()).toEqual(["HYPE", "SPCX", "jitoSOL", "NVDAx", "USDC", "SPYx", "ZEC", "USDC vault"]);
  });

  it("filters by section and keeps the URL shareable", async () => {
    const user = userEvent.setup();
    render(<VaultsClient initialCategory="all" />);
    expect(screen.getAllByRole("button", { pressed: false }).map((b) => b.textContent)).toEqual(["Crypto3", "Stocks3", "Stables1"]);

    await user.click(screen.getByRole("button", { name: /^Stocks/ }));
    expect(cardNames()).toEqual(["SPCX", "NVDAx", "SPYx"]);
    expect(window.location.search).toBe("?category=stocks");

    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(cardNames()).toHaveLength(7);
    expect(window.location.search).toBe("");
  });

  it("keeps a linked section with no vaults and offers the way back", async () => {
    const user = userEvent.setup();
    const stocks = new Set([SAMPLE.keys.nvdax, SAMPLE.keys.spyx, SAMPLE.keys.spcx]);
    state.vaults = { ...state.vaults, data: SAMPLE.vaults.filter((v) => !stocks.has(v.vault_pda)) };
    render(<VaultsClient initialCategory="Stocks" />);
    expect(screen.getByRole("button", { name: /^Stocks/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Nothing in Stocks yet.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Show all vaults" }));
    expect(cardNames()).toEqual(["HYPE", "jitoSOL", "USDC", "ZEC"]);
  });

  it("sorts by TVL or name, and keeps the order inside a section", async () => {
    const user = userEvent.setup();
    state.vaults = { ...state.vaults, data: [CLOSING, ...SAMPLE.vaults] };
    render(<VaultsClient initialCategory="all" />);
    const sort = screen.getByRole("combobox", { name: "Sort vaults" });

    await user.selectOptions(sort, "TVL");
    expect(cardNames()).toEqual(["ZEC", "HYPE", "USDC", "SPYx", "SPCX", "NVDAx", "jitoSOL", "USDC vault"]);

    await user.selectOptions(sort, "Name");
    expect(cardNames()).toEqual(["HYPE", "jitoSOL", "NVDAx", "SPCX", "SPYx", "USDC", "USDC vault", "ZEC"]);

    await user.click(screen.getByRole("button", { name: /^Stocks/ }));
    expect(cardNames()).toEqual(["NVDAx", "SPCX", "SPYx"]);
  });

  it("shows the backend's dollar TVL, and the asset itself without one", () => {
    state.vaults = {
      ...state.vaults,
      data: SAMPLE.vaults.map((v) => (v.vault_pda === SAMPLE.keys.zec ? { ...v, tvl_usd_1e9: null } : v)),
    };
    render(<VaultsClient initialCategory="all" />);
    expect(card("jitoSOL").getByText("$102K")).toBeTruthy();
    expect(card("USDC").getByText("$2.11M")).toBeTruthy();
    expect(card("ZEC").getByText("7,238 ZEC")).toBeTruthy();
  });

  it("opens deposits on Deposit, and a closing vault on Withdraw", async () => {
    const user = userEvent.setup();
    state.vaults = { ...state.vaults, data: [CLOSING, ...SAMPLE.vaults] };
    render(<VaultsClient initialCategory="all" />);

    const jito = screen.getByRole("article", { name: "jitoSOL" });
    await user.click(within(jito).getByRole("button", { name: "Deposit" }));
    expect(screen.getByTestId("vault-modal").dataset).toMatchObject({ pda: SAMPLE.keys.jitosol, tab: "deposit" });

    const closing = screen.getByRole("article", { name: "USDC vault" });
    await user.click(within(closing).getByRole("button", { name: "Manage" }));
    expect(screen.getByTestId("vault-modal").dataset).toMatchObject({ pda: CLOSING.vault_pda, tab: "withdraw" });

    expect(within(jito).getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/earn/${SAMPLE.keys.jitosol}`);
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
