import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getTokenMint } from "@/lib/tokens";
import { makePerformance, makeVault, parseSampleData } from "@/lib/vaults/sample";
import sampleFile from "@/lib/vaults/sample-data.json";
import { VAULT_ACCESS_URL } from "@/lib/landing-vaults";
import type { LineupEntry } from "@/lib/vaults/lineup";
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
  LazyVaultDepositModal: ({ vault, meta, initialTab }: { vault: Vault; meta: { name: string }; initialTab: string }) => (
    <div data-testid="vault-modal" data-pda={vault.vault_pda} data-tab={initialTab} data-name={meta.name} />
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

// the lineup once two of its vaults have addresses: jitoSOL and USDC live, TSLA not open yet
const LINEUP: LineupEntry[] = [
  { id: "jitosol", asset: "jitoSOL", type: "Majors", pda: { devnet: SAMPLE.keys.jitosol, mainnet: SAMPLE.keys.jitosol }, state: "open", assumedApr: { staking: 7, premium: 11 } },
  { id: "usdc", asset: "USDC", type: "Stables", pda: { devnet: SAMPLE.keys.usdc, mainnet: SAMPLE.keys.usdc }, state: "open", assumedApr: { staking: 0, premium: 20 } },
  { id: "tsla", asset: "TSLA", type: "Stocks", pda: { devnet: null, mainnet: null }, state: "soon" },
];

const cardNames = () => screen.queryAllByRole("article").map((card) => card.getAttribute("aria-label"));
const card = (name: string) => within(screen.getByRole("article", { name }));
const show = (lineup: readonly LineupEntry[] = LINEUP) => render(<VaultsClient lineup={lineup} />);

beforeEach(() => {
  state.vaults = { data: SAMPLE.vaults, error: null, loading: false, refresh: vi.fn() };
});

afterEach(() => {
  cleanup();
});

describe("VaultsClient", () => {
  it("shows the lineup and the partner cell, in order, and none of the other vaults the backend serves", () => {
    state.vaults = { ...state.vaults, data: [CLOSING, ...SAMPLE.vaults] };
    show();
    expect(cardNames()).toEqual(["jitoSOL", "USDC", "TSLA", "Your vaults"]);
    // seven fixtures and a closing vault are served; only the two the lineup names are listed
    expect(screen.queryByText("HYPE")).toBeNull();
    expect(screen.queryByText(/Wind/)).toBeNull();
    // no filter and no sort for three vaults
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("group", { name: /Filter/ })).toBeNull();
  });

  it("ships with jitoSOL, USDC and TSLA open on assumed rates, each said to come from backtesting", async () => {
    const user = userEvent.setup();
    render(<VaultsClient />);
    expect(cardNames()).toEqual(["jitoSOL", "USDC", "TSLA", "Your vaults"]);
    expect(screen.queryByText("Not open yet")).toBeNull();
    // the sum of its parts, with the parts drawn as on the landing page
    const jito = card("jitoSOL");
    expect(jito.getByText("~18%")).toBeTruthy();
    expect(jito.getByText("staking + premium")).toBeTruthy();
    expect(jito.getByText("Staking ~7.00%")).toBeTruthy();
    expect(jito.getByText("Premium ~11.00%")).toBeTruthy();
    expect(card("USDC").getByText("~20%")).toBeTruthy();
    expect(card("TSLA").getByText("~25%")).toBeTruthy();
    expect(card("TSLA").getByText("Premium ~25.00%")).toBeTruthy();
    // an assumed rate is never passed off as a live one
    await user.click(card("TSLA").getByRole("button", { name: "Where this APY comes from" }));
    expect(screen.getByRole("tooltip").textContent).toContain("An estimate from backtesting. It is not this vault's live result and not a promise.");
    // no vault behind it: no TVL, no curator, no status, and Deposit leads where the landing page's does
    expect(card("TSLA").queryByText("TVL")).toBeNull();
    expect(card("TSLA").queryByText("Accepting deposits")).toBeNull();
    const deposit = card("TSLA").getByRole("link", { name: "Deposit" });
    expect(deposit.getAttribute("href")).toBe(VAULT_ACCESS_URL);
    expect(deposit.getAttribute("target")).toBe("_blank");
    expect(screen.queryByTestId("vault-modal")).toBeNull();
  });

  it("names a listed vault by its asset and calls it an income vault, whatever its operator named it", () => {
    show();
    const jito = card("jitoSOL");
    expect(jito.getByRole("heading", { name: "jitoSOL" })).toBeTruthy();
    expect(jito.getByRole("link", { name: "jitoSOL" }).getAttribute("href")).toBe(`/earn/${SAMPLE.keys.jitosol}`);
    expect(jito.getByText("Income vault")).toBeTruthy();
    // the lineup's label, in the landing page's words, not the vault's category
    expect(jito.getByText("Majors")).toBeTruthy();
    expect(card("USDC").getByText("Stables")).toBeTruthy();
    // the operator's own line for the USDC fixture stays off the card
    expect(card("USDC").queryByText(/Sells weekly puts/)).toBeNull();
  });

  it("draws a live vault the landing page's way: the rate, its parts as bars, the buttons last", () => {
    show();
    const jito = card("jitoSOL");
    // jitoSOL earns staking on top of premium: the rate names both and draws a bar for each
    expect(jito.getByText("staking + premium")).toBeTruthy();
    expect(jito.getByText(/^Staking [\d.]+%$/)).toBeTruthy();
    expect(jito.getByText(/^Premium [\d.]+%$/)).toBeTruthy();
    expect(jito.getAllByText(/^[\d.]+%$/)[0].className).not.toContain("text-additional-red-primary");
    expect(jito.getAllByText(/^[\d.]+%$/)[0].className).toContain("text-[clamp(40px,6vw,54px)]");
    // nothing renders after the buttons
    const article = screen.getByRole("article", { name: "jitoSOL" });
    expect(article.lastElementChild!.lastElementChild!.textContent).toBe("DepositDetails");
  });

  it("shows the backend's dollar TVL with the asset amount beside it, and the asset alone without a price", () => {
    state.vaults = { ...state.vaults, data: SAMPLE.vaults.map((v) => (v.vault_pda === SAMPLE.keys.usdc ? { ...v, tvl_usd_1e9: null } : v)) };
    show();
    expect(card("jitoSOL").getByText("$102K")).toBeTruthy();
    expect(card("jitoSOL").getByText(/^[\d,.]+[KM]? jitoSOL$/)).toBeTruthy();
    expect(card("USDC").getAllByText(/^[\d,.]+[KM]? USDC$/)).toHaveLength(1);
    expect(card("USDC").queryByText("Balance")).toBeNull();
  });

  it("marks a negative rate and draws no bars for it", () => {
    state.vaults = { ...state.vaults, data: SAMPLE.vaults.map((v) => (v.vault_pda === SAMPLE.keys.usdc ? { ...v, performance: makePerformance({ apy_30d: -12.5 }) } : v)) };
    show();
    expect(card("USDC").getByText("-12.50%").className).toContain("text-additional-red-primary");
    expect(card("USDC").queryByText(/^Premium /)).toBeNull();
  });

  it("says why a young vault has no rate yet, where the parts would be", () => {
    state.vaults = { ...state.vaults, data: SAMPLE.vaults.map((v) => (v.vault_pda === SAMPLE.keys.usdc ? { ...v, performance: makePerformance() } : v)) };
    show();
    expect(card("USDC").getByText("New")).toBeTruthy();
    expect(card("USDC").getByText("Projected APY shows after 20 days of history.")).toBeTruthy();
    // a word where the rate would be sits under the vault's name at the size of a figure, on one line with its label
    const word = card("USDC").getByText("New");
    expect(word.className).toContain("text-2xl");
    expect(word.parentElement!.className).toContain("items-baseline");
  });

  it("shows a vault that is not open yet as the landing page does: dimmed, in words, with nothing to press and no invented rate", () => {
    show();
    const tsla = screen.getByRole("article", { name: "TSLA" });
    expect(tsla.className).toContain("opacity-[0.55]");
    expect(within(tsla).getByText("Stocks")).toBeTruthy();
    expect(within(tsla).getByText("Income vault")).toBeTruthy();
    expect(within(tsla).getByText("Not open yet")).toBeTruthy();
    expect(within(tsla).getByText("Opening soon")).toBeTruthy();
    expect(within(tsla).queryByRole("button")).toBeNull();
    expect(within(tsla).queryByRole("link")).toBeNull();
    expect(tsla.textContent).not.toMatch(/%/);
  });

  it("carries a rate for an unopened vault only when the lineup has been given one", () => {
    show([{ id: "tsla", asset: "TSLA", type: "Stocks", pda: { devnet: null, mainnet: null }, state: "soon", assumedApr: { staking: 0, premium: 70 } }]);
    const tsla = card("TSLA");
    expect(tsla.getByText("~70%")).toBeTruthy();
    expect(tsla.getByText("premium")).toBeTruthy();
    expect(tsla.getByText("Premium ~70.00%")).toBeTruthy();
    // still not open: the rate does not bring a button with it
    expect(tsla.queryByRole("link", { name: "Deposit" })).toBeNull();
  });

  it("falls back to the lineup's own words for a vault the backend does not serve", () => {
    state.vaults = { ...state.vaults, data: SAMPLE.vaults.filter((v) => v.vault_pda !== SAMPLE.keys.usdc) };
    show();
    // USDC is open in the lineup, so it shows its assumed rate; jitoSOL is still live
    expect(card("USDC").getByText("~20%")).toBeTruthy();
    expect(card("USDC").getByRole("link", { name: "Deposit" }).getAttribute("href")).toBe(VAULT_ACCESS_URL);
    expect(card("jitoSOL").getByRole("button", { name: "Deposit" })).toBeTruthy();
  });

  it("replaces the assumed rate with the vault's own figures once it has an address", () => {
    show();
    const jito = card("jitoSOL");
    expect(jito.queryByText("~18%")).toBeNull();
    expect(jito.getByText("Accepting deposits")).toBeTruthy();
    expect(jito.getByText("TVL")).toBeTruthy();
  });

  it("keeps the landing page's partner cell as the last one", () => {
    show();
    const partner = card("Your vaults");
    expect(partner.getByText("Partners")).toBeTruthy();
    expect(partner.getByRole("link", { name: "Partner with us" }).getAttribute("href")).toBe("/partners");
  });

  it("opens deposits on Deposit, and a vault that takes none on Withdraw, under the lineup name", async () => {
    const user = userEvent.setup();
    state.vaults = { ...state.vaults, data: SAMPLE.vaults.map((v) => (v.vault_pda === SAMPLE.keys.usdc ? { ...v, safety: "closing" as const } : v)) };
    show();
    const jito = screen.getByRole("article", { name: "jitoSOL" });
    await user.click(within(jito).getByRole("button", { name: "Deposit" }));
    expect(screen.getByTestId("vault-modal").getAttribute("data-pda")).toBe(SAMPLE.keys.jitosol);
    expect(screen.getByTestId("vault-modal").getAttribute("data-tab")).toBe("deposit");
    expect(screen.getByTestId("vault-modal").getAttribute("data-name")).toBe("jitoSOL");
    await user.click(card("USDC").getByRole("button", { name: "Manage" }));
    expect(screen.getByTestId("vault-modal").getAttribute("data-tab")).toBe("withdraw");
    expect(within(jito).getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/earn/${SAMPLE.keys.jitosol}`);
  });

  it("shows skeletons first and a retry when nothing could load", async () => {
    const user = userEvent.setup();
    state.vaults = { data: [], error: null, loading: true, refresh: vi.fn() };
    const { rerender } = show();
    expect(cardNames()).toHaveLength(0);

    const refresh = vi.fn();
    state.vaults = { data: [], error: new Error("down"), loading: false, refresh };
    rerender(<VaultsClient lineup={LINEUP} />);
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the last loaded lineup on screen when a refresh fails", () => {
    state.vaults = { ...state.vaults, error: new Error("down") };
    show();
    expect(screen.getByRole("status").textContent).toContain("Couldn't refresh");
    expect(cardNames()).toEqual(["jitoSOL", "USDC", "TSLA", "Your vaults"]);
  });

  it("a bound vault with no performance yet shows the lineup's assumed rate, marked as an assumption, and one logo", () => {
    const lst = "LSTvault1111111111111111111111111111111111";
    state.vaults = {
      ...state.vaults,
      data: [makeVault({ vault_pda: lst, main_mint: getTokenMint("LST")!, second_mint: getTokenMint("JITOSOL")!, phase: "active", active_expiry_ts: NOW + 86_400, accepting_deposits: true, performance: null })],
    };
    show([{ id: "lst", asset: "LST", type: "Majors", pda: { devnet: lst, mainnet: lst }, state: "open", assumedApr: { staking: 7, premium: 11 } }]);
    const cell = card("LST");
    expect(cell.getByText("~18%")).toBeTruthy();
    expect(cell.getByText("APY")).toBeTruthy();
    expect(cell.queryByText("Projected APY")).toBeNull();
    expect(cell.queryByText("—")).toBeNull();
    expect(cell.getByText("staking + premium")).toBeTruthy();
    expect(cell.getByText("Staking ~7.00%")).toBeTruthy();
    expect(cell.getByText("Premium ~11.00%")).toBeTruthy();
    // it is live: TVL, status and a Deposit button that opens the vault, as for any bound card
    expect(cell.getByText("TVL")).toBeTruthy();
    expect(cell.getByText("Accepting deposits")).toBeTruthy();
    expect(cell.getByRole("button", { name: "Deposit" })).toBeTruthy();
    // the lineup asset's logo alone, not the vault's second leg
    expect(cell.getByLabelText("Deposit LST")).toBeTruthy();
    expect(cell.queryByLabelText("jitoSOL")).toBeNull();
    expect(cell.getByRole("link", { name: "Details" }).getAttribute("href")).toBe(`/earn/${lst}`);
  });

  it("once the backend serves a figure, the card shows it with the lineup's staking part, and no tilde", () => {
    const lst = "LSTvault1111111111111111111111111111111111";
    state.vaults = {
      ...state.vaults,
      data: [makeVault({ vault_pda: lst, main_mint: getTokenMint("LST")!, phase: "active", active_expiry_ts: NOW + 86_400, accepting_deposits: true, performance: makePerformance({ apy_30d: 12 }) })],
    };
    show([{ id: "lst", asset: "LST", type: "Majors", pda: { devnet: lst, mainnet: lst }, state: "open", assumedApr: { staking: 7, premium: 11 } }]);
    const cell = card("LST");
    expect(cell.getByText("19.00%")).toBeTruthy();
    expect(cell.getByText("Projected APY")).toBeTruthy();
    expect(cell.queryByText("~18%")).toBeNull();
    expect(cell.getByText("Staking 7.00%")).toBeTruthy();
    expect(cell.getByText("Premium 12.00%")).toBeTruthy();
  });

  it("keeps saying Deposit for a bound vault between cycles, where the form says when deposits open", async () => {
    const user = userEvent.setup();
    state.vaults = {
      ...state.vaults,
      data: SAMPLE.vaults.map((v) => (v.vault_pda === SAMPLE.keys.usdc ? { ...v, phase: "idle" as const, accepting_deposits: false } : v)),
    };
    show();
    await user.click(card("USDC").getByRole("button", { name: "Deposit" }));
    expect(screen.getByTestId("vault-modal").getAttribute("data-tab")).toBe("deposit");
  });
});
