import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vaultApr } from "@/lib/vaults/presentation";
import { AprLabel } from "./vault-apr";

const track = { cycles_completed: 9, last_cycle_return_pct: 0.2, cumulative_return_pct: 2, track_record_secs: "5000000" };
const STAKED = vaultApr({ status: "annualized", annualized_return_pct: 10, ...track }, 5);
const INFO = { name: "What makes up this APR" };

afterEach(() => {
  cleanup();
});

describe("AprLabel", () => {
  it("breaks the APR into its sources on keyboard focus, and Escape closes it", async () => {
    const user = userEvent.setup();
    render(<AprLabel apr={STAKED} />);
    expect(screen.queryByRole("tooltip")).toBeNull();

    await user.tab();
    const tip = screen.getByRole("tooltip");
    expect(screen.getByRole("button", INFO).getAttribute("aria-describedby")).toBe(tip.id);
    expect(tip.textContent).toContain("Staking5.00%");
    expect(tip.textContent).toContain("Premium10.00%");
    expect(tip.textContent).toContain("APR15.00%");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on a tap and closes on the next, even where a tap also focuses the button", async () => {
    const user = userEvent.setup();
    render(<AprLabel apr={STAKED} />);
    const button = screen.getByRole("button", INFO);

    await user.pointer({ keys: "[TouchA]", target: button });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.pointer({ keys: "[TouchA]", target: button });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open while a mouse hovers, clicks included", async () => {
    const user = userEvent.setup();
    render(<AprLabel apr={STAKED} />);
    const button = screen.getByRole("button", INFO);

    await user.hover(button);
    await user.click(button);
    expect(screen.getByRole("tooltip")).toBeTruthy();
    await user.unhover(button);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows only the known part for a vault without a premium yet", async () => {
    const user = userEvent.setup();
    render(<AprLabel apr={vaultApr({ status: "no_track_record" }, 5)} />);
    await user.tab();
    const tip = within(screen.getByRole("tooltip"));
    expect(tip.getByText("Staking")).toBeTruthy();
    expect(tip.queryByText("Premium")).toBeNull();
    expect(tip.queryByText("APR")).toBeNull();
    expect(tip.getByText("Premium shows after 30 days of history.")).toBeTruthy();
  });
});
