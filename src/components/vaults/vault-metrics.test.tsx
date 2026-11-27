import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { makePerformance, makeVault } from "@/lib/vaults/sample";
import { getTokenMint } from "@/lib/tokens";
import { VaultCapacity, VaultMetrics } from "./vault-metrics";

afterEach(cleanup);

describe("VaultCapacity", () => {
  it("shows deposits against no cap without a progress value", () => {
    render(<VaultCapacity vault={makeVault({ main_decimals: 0, equity: "99", capacity: { type: "unlimited" } })} symbol="SOL" />);
    // nothing to fill without a cap, so it is said in words and no empty bar is drawn
    expect(screen.getByRole("region", { name: "Vault capacity" }).textContent).toBe("Capacity99 SOL deposited, no cap");
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("uses served capacity remaining rather than equity to measure usage", () => {
    render(<VaultCapacity vault={makeVault({ main_decimals: 0, equity: "99", capacity: { type: "limited", cap_limit: "100", remaining: "25" } })} symbol="SOL" />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("75");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("25 SOL remaining");
    expect(screen.getByText("75 / 100 SOL")).toBeTruthy();
  });
});

describe("VaultMetrics", () => {
  it("reads the APY tile the way the card does: the lineup's assumption until the backend serves a figure", () => {
    const symbol = "LST";
    const vault = makeVault({ main_mint: getTokenMint("LST")!, performance: null });
    const assumedApr = { staking: 7, premium: 11 };
    const { rerender } = render(<VaultMetrics vault={vault} symbol={symbol} stakingAprPct={7} assumedApr={assumedApr} />);
    const region = () => screen.getByRole("region", { name: "Vault metrics" });
    expect(region().textContent).toContain("~18%");
    expect(region().textContent).toContain("APY");
    rerender(<VaultMetrics vault={{ ...vault, performance: makePerformance({ apy_30d: 12 }) }} symbol={symbol} stakingAprPct={7} assumedApr={assumedApr} />);
    expect(region().textContent).toContain("19.00%");
  });
});
