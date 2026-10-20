import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { getTokenMint } from "@/lib/tokens";
import { makeVault, parseSampleData } from "@/lib/vaults/sample";
import sampleFile from "@/lib/vaults/sample-data.json";
import { VaultCurrentCycle, VaultExposureCard } from "./vault-cycle";

const NOW = 1_800_000_000;
const USDC = getTokenMint("USDC")!;

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
    expect(screen.getByText("Trading")).toBeTruthy();
    expect(screen.getByText(/2d 1h/)).toBeTruthy();
    expect(screen.getByText("2,842 USDC")).toBeTruthy();
    expect(screen.getByText(/^Premium since/)).toBeTruthy();
    expect(screen.getByText("30,115.6 USDC · paid 2,984.1")).toBeTruthy();
  });

  it("drops empty premium, and the whole block between cycles with nothing to show", () => {
    const empty = { received: "0", paid: null };
    const idle = makeVault({ phase: "idle", second_mint: USDC, second_decimals: 6, premium: [{ quote_mint: USDC, cycle: empty, generation: empty }] });
    const { container } = render(<VaultCurrentCycle vault={idle} nowSecs={NOW} />);
    expect(container.innerHTML).toBe("");

    const earned = { ...idle, premium: [{ quote_mint: USDC, cycle: empty, generation: { received: "5000000", paid: "0" } }] };
    render(<VaultCurrentCycle vault={earned} nowSecs={NOW} />);
    expect(screen.getByText("Between cycles")).toBeTruthy();
    expect(screen.queryByText("Ends")).toBeNull();
    expect(screen.queryByText("Premium this cycle")).toBeNull();
    expect(screen.getByText("5 USDC")).toBeTruthy();
  });
});

describe("VaultExposureCard", () => {
  it("renders the sample legs and hides a total that lacks a spot", () => {
    const data = parseSampleData(sampleFile, sampleFile.anchor);
    render(<VaultExposureCard exposure={data.exposure[data.keys.hype]} />);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByText("Net intrinsic at spot")).toBeNull();
  });
});
