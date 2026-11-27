import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  it("names the cycle, its phase and the countdown to expiry", () => {
    const vault = makeVault({ phase: "active", active_expiry_ts: NOW + 2 * 86_400 + 3_600 });
    const record: VaultCycle = {
      cycle_number: 1, capital_generation: vault.capital_generation, expiry_ts: vault.active_expiry_ts,
      started_at: NOW - 3600, finished_at: null, share_price_start: "1000000000",
      share_price_end: "1000000001", equity_start: "100", equity_end: "101", positions_opened: 1,
      positions_settled: 0, return_pct: 0.01, performance_fee_assessed: "0", management_fee_assessed: "0",
    };
    render(<VaultCurrentCycle vault={vault} nowSecs={NOW} cycles={[record]} />);
    expect(screen.getByRole("heading", { name: "Current cycle · 2" })).toBeTruthy();
    expect(screen.getByText("Trading")).toBeTruthy();
    expect(screen.getByText(/2d 1h/)).toBeTruthy();
  });

  it("says only the phase when between cycles, with no countdown", () => {
    render(<VaultCurrentCycle vault={makeVault({ phase: "idle" })} nowSecs={NOW} />);
    expect(screen.getByRole("heading", { name: "Current cycle" })).toBeTruthy();
    expect(screen.getByText("Between cycles")).toBeTruthy();
    expect(screen.queryByText(/left$/)).toBeNull();
  });
});

describe("VaultExposureCard", () => {
  const leg = (position: string, position_type: VaultExposurePosition["position_type"], role: VaultExposurePosition["role"], quantity: string): VaultExposurePosition => ({
    position_pda: position, market_pda: "m", position_type, role, status: "open", strike: "100000000000", quantity, expiry_ts: 1800000000,
    underlying_mint: SOL, quote_mint: USDC, underlying_decimals: 9, quote_decimals: 6,
    spot: "95000000000", spot_published_at: 1, distance_pct: null, itm: null, intrinsic: null,
  });
  const detail = (position: string, role: "writer" | "holder"): VaultPosition => ({
    position_pda: position, role, position_type: "call_spread", strike: "100000000000", quantity: "1000000000", net_premium: "1000000",
    product: { type: "spread", upper_strike: "110000000000", collateral: "10000000" },
  } as VaultPosition);
  const exposure = (positions: VaultExposurePosition[]): VaultExposure => ({ vault_pda: "v", as_of: 1, positions, totals: [] });

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

  const many = (count: number) => Array.from({ length: count }, (_, i) => leg(`p${i}`, "call_spread", "writer", String((i + 1) * 1_000_000_000)));

  it("shows the first ten of a long list and the rest on request, with the total over all of them", () => {
    const legs = many(13);
    render(<VaultExposureCard exposure={exposure(legs)} positions={legs.map((l) => detail(l.position_pda, "writer"))} />);
    // header + ten
    expect(screen.getAllByRole("row")).toHaveLength(11);
    const total = screen.getByText("Net P&L at spot").parentElement!.textContent;
    fireEvent.click(screen.getByRole("button", { name: "Show all 13 positions" }));
    expect(screen.getAllByRole("row")).toHaveLength(14);
    expect(screen.getByText("Net P&L at spot").parentElement!.textContent).toBe(total);
    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });

  it("offers no Show all for a short list", () => {
    render(<VaultExposureCard exposure={exposure(many(3))} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  describe("on a phone", () => {
    const real = window.matchMedia;
    beforeEach(() => {
      window.matchMedia = ((query: string) => ({ matches: query.includes("max-width: 767px"), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    });
    afterEach(() => {
      window.matchMedia = real;
    });

    it("stacks each position in two lines, with no table to scroll sideways, and keeps sort and filters", () => {
      render(
        <VaultExposureCard
          exposure={exposure([leg("a", "call_spread", "writer", "1000000000"), leg("b", "call_spread", "holder", "3000000000")])}
          positions={[detail("a", "writer"), detail("b", "holder")]}
        />,
      );
      expect(screen.queryByRole("table")).toBeNull();
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      const sort = within(screen.getByRole("group", { name: "Sort positions" }));
      fireEvent.click(sort.getByRole("button", { name: "Size" }));
      expect(screen.getAllByRole("listitem")[0].textContent).toContain("1 SOL");
      fireEvent.click(sort.getByRole("button", { name: /Size/ }));
      expect(screen.getAllByRole("listitem")[0].textContent).toContain("3 SOL");
      fireEvent.click(screen.getByRole("button", { name: "Filter by side" }));
      fireEvent.click(screen.getByRole("menuitemradio", { name: "Sold" }));
      expect(screen.getAllByRole("listitem")).toHaveLength(1);
    });
  });
});
