import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InfoTooltip } from "./info-tooltip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Opens the tip with its (i) at the given spot; the tip itself is 260 by 60 in a 1024 by 768 window. */
function openAt(trigger: { left: number; bottom: number }) {
  vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: trigger.left,
    right: trigger.left + 16,
    top: trigger.bottom - 16,
    bottom: trigger.bottom,
    width: 16,
    height: 16,
    x: trigger.left,
    y: trigger.bottom - 16,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(260);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
  render(<InfoTooltip label="About this">Words</InfoTooltip>);
  fireEvent.click(screen.getByRole("button", { name: "About this" }));
  const tip = screen.getByRole("tooltip");
  return { left: tip.style.left, top: tip.style.top };
}

describe("InfoTooltip placement", () => {
  it("opens below the (i) and runs to the right from its left edge", () => {
    expect(openAt({ left: 100, bottom: 216 })).toEqual({ left: "100px", top: "224px" });
  });

  it("slides left to stay on screen when there is no room on the right, still below", () => {
    expect(openAt({ left: 900, bottom: 216 })).toEqual({ left: "756px", top: "224px" });
  });

  it("never opens above: short of room below it stays as low as it fits, beside the (i)", () => {
    // 768 tall: the lowest a 60px tip fits is 700, and it steps right of the (i) instead of covering it
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    expect(openAt({ left: 100, bottom: 760 })).toEqual({ left: "124px", top: "700px" });
    // opened by a key or a tap, it first asks the page to move up by what is missing (760 + 8 + 60 + 8 - 768)
    expect(scrollBy).toHaveBeenCalledWith({ top: 68, behavior: "instant" });
  });

  it("does not move the page for a mouse", () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
    vi.spyOn(HTMLButtonElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 100, right: 116, top: 744, bottom: 760, width: 16, height: 16, x: 100, y: 744, toJSON: () => ({}) });
    render(<InfoTooltip label="About this">Words</InfoTooltip>);
    const button = screen.getByRole("button", { name: "About this" });
    fireEvent.pointerDown(button, { pointerType: "mouse" });
    fireEvent.pointerEnter(button, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toBeTruthy();
    expect(scrollBy).not.toHaveBeenCalled();
  });
});
