import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { getTokenMint } from "@/lib/tokens";
import { makeVault, parseSampleData } from "@/lib/vaults/sample";
import sampleFile from "@/lib/vaults/sample-data.json";
import type { VaultCycle, VaultExposure, VaultExposurePosition, VaultPosition } from "@/lib/vaults/types";
import { VaultCurrentCycle, VaultExposureCard, VaultSpot } from "./vault-cycle";

const NOW = 1_800_000_000;
const USDC = getTokenMint("USDC")!;
const SOL = getTokenMint("SOL")!;

afterEach(() => {
  cleanup();
});

describe("VaultCurrentCycle", () => {
  it("counts down to expiry and shows premium for the cycle and the generation", () => {
    const vault = makeVault({
      phase: "active",
      active_expiry: String(NOW + 2 * 86_400 + 3_600),
      second_mint: USDC,
      second_decimals: 6,
      generation_started_at: "1790000000",
      premium: [
        { quote_mint: USDC, cycle: { received: "2842000000", paid: null }, generation: { received: "30115600000", paid: "2984100000" } },
      ],
    });
    render(<VaultCurrentCycle vault={vault} nowSecs={NOW} />);
    expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Trading");
    expect(screen.getByText(/2d 1h/)).toBeTruthy();
    expect(screen.getByText("2,842 USDC")).toBeTruthy();
    expect(screen.getByText(/^Premium since/)).toBeTruthy();
    expect(screen.getByText("30,115.6 USDC · paid 2,984.1")).toBeTruthy();
  });

  it("matches the active expiry and never substitutes a vault-wide settlement for cycle completion", () => {
    const vault = makeVault({ phase: "active", active_expiry: String(NOW + 3600), last_settlement_at: String(NOW - 60) });
    const record: VaultCycle = {
      cycle_number: "1", capital_generation: vault.capital_generation, expiry_ts: vault.active_expiry,
      started_at: String(NOW - 3600), finished_at: null, share_price_start: "1000000000",
      share_price_end: "1000000001", equity_start: "100", equity_end: "101", positions_opened: 1,
      positions_settled: 0, return_pct: 0.01, performance_fee_assessed: "0", management_fee_assessed: "0",
    };
    const { rerender } = render(<VaultCurrentCycle vault={vault} nowSecs={NOW} cycles={[
      { ...record, expiry_ts: String(NOW - 7200), finished_at: String(NOW - 3600) }, record,
    ]} />);
    expect(screen.getByRole("heading", { name: "Current cycle · 2" })).toBeTruthy();
    const settlement = screen.getByText("Settlement").parentElement!;
    expect(within(settlement).getByText("Pending")).toBeTruthy();
    rerender(<VaultCurrentCycle vault={{ ...vault, phase: "settling" }} nowSecs={NOW + 7200} cycles={[record]} />);
    expect(screen.queryByText(/left$/)).toBeNull();
    expect(screen.getByText("0 / 1 settled")).toBeTruthy();
    expect(screen.getByText("Settlement").closest("li")?.getAttribute("aria-current")).toBe("step");
    rerender(<VaultCurrentCycle vault={vault} nowSecs={NOW} cycles={[{ ...record, finished_at: String(NOW) }]} />);
    expect(screen.queryByText("Pending")).toBeNull();
    // A missing generation tag does not erase a recorded cycle boundary.
    rerender(<VaultCurrentCycle vault={vault} nowSecs={NOW} cycles={[{ ...record, capital_generation: null, finished_at: String(NOW) }]} />);
    expect(screen.getByRole("heading", { name: "Current cycle · 2" })).toBeTruthy();
    expect(screen.queryByText("Not recorded")).toBeNull();
    // Settlement can retain the expiry across a capital-generation transition.
    rerender(<VaultCurrentCycle vault={{ ...vault, capital_generation: "99", phase: "processing_capital" }} nowSecs={NOW} cycles={[{ ...record, finished_at: String(NOW) }]} />);
    expect(screen.queryByText("Not recorded")).toBeNull();
  });

  it("shows an open staging slot between cycles", () => {
    const vault = makeVault({
      phase: "idle",
      staging: { mint: USDC, from_leg: "second", amount: "1250000000", staged_at: String(NOW), generation: "3" },
    });
    render(<VaultCurrentCycle vault={vault} nowSecs={NOW} />);
    expect(screen.getByText("Swap in progress")).toBeTruthy();
    expect(screen.getByText("1,250 USDC from SOL")).toBeTruthy();
  });

  it("keeps the idle status visible and drops empty premium", () => {
    const empty = { received: "0", paid: null };
    const idle = makeVault({ phase: "idle", second_mint: USDC, second_decimals: 6, premium: [{ quote_mint: USDC, cycle: empty, generation: empty }] });
    const { unmount } = render(<VaultCurrentCycle vault={idle} nowSecs={NOW} />);
    expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Idle");
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.queryByText("Premium this cycle")).toBeNull();
    unmount();

    const earned = { ...idle, premium: [{ quote_mint: USDC, cycle: empty, generation: { received: "5000000", paid: "0" } }] };
    render(<VaultCurrentCycle vault={earned} nowSecs={NOW} />);
    expect(screen.getByText("Between cycles")).toBeTruthy();
    expect(screen.queryByText("Ends")).toBeNull();
    expect(screen.queryByText("Premium this cycle")).toBeNull();
    expect(screen.getByText("5 USDC")).toBeTruthy();
  });
});

describe("VaultExposureCard", () => {
  const leg = (position: string, position_type: VaultExposurePosition["position_type"], role: VaultExposurePosition["role"], quantity: string): VaultExposurePosition => ({
    position_pda: position, market_pda: "m", position_type, role, status: "open", strike: "100000000000", quantity, expiry_ts: "1800000000",
    underlying_mint: SOL, quote_mint: USDC, underlying_decimals: 9, quote_decimals: 6,
    spot: "95000000000", spot_published_at: "1", distance_pct: null, itm: null, intrinsic: null,
  });
  const detail = (position: string, role: "writer" | "holder"): VaultPosition => ({
    position_pda: position, role, position_type: "call_spread", strike: "100000000000", quantity: "1000000000", net_premium: "1000000",
    product: { kind: "spread", upper_strike: "110000000000", collateral: "10000000" },
  } as VaultPosition);
  const exposure = (positions: VaultExposurePosition[]): VaultExposure => ({ vault_pda: "v", as_of: "1", positions, totals: [] });

  it("renders the sample legs and hides a total that lacks a spot", () => {
    const data = parseSampleData(sampleFile, sampleFile.anchor);
    render(<VaultExposureCard exposure={data.exposure[data.keys.hype]} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.queryByText("Net P&L at spot")).toBeNull();
  });

  it("shows spot from the exposure response", () => {
    render(<VaultSpot exposure={exposure([leg("a", "call_spread", "writer", "1000000000")])} />);
    expect(screen.getByText("$95")).toBeTruthy();
  });

  it("filters by side and sorts by a column", () => {
    render(
      <VaultExposureCard
        exposure={exposure([leg("a", "call_spread", "writer", "1000000000"), leg("b", "call_spread", "holder", "3000000000")])}
        positions={[detail("a", "writer"), detail("b", "holder")]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Size" }));
    expect(screen.getAllByRole("row")[1].textContent).toContain("1 SOL");
    fireEvent.click(screen.getByRole("button", { name: /Size/ }));
    expect(screen.getAllByRole("row")[1].textContent).toContain("3 SOL");
    fireEvent.click(screen.getByRole("button", { name: "Filter by side" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Sold" }));
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
