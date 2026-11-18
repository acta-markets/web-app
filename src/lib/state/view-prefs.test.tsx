import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VIEW_DEFAULTS, useViewPref, viewPrefsStore } from "./view-prefs";

describe("a remembered view choice", () => {
  it("is the default on a first visit", () => {
    expect(renderHook(() => useViewPref("portfolioTab")).result.current[0]).toBe("open");
  });

  it("is kept when set, and is there for the next component that asks", () => {
    const first = renderHook(() => useViewPref("incomeRange"));
    act(() => first.result.current[1]("7d"));
    expect(first.result.current[0]).toBe("7d");
    first.unmount();
    expect(renderHook(() => useViewPref("incomeRange")).result.current[0]).toBe("7d");
  });

  it("does not disturb the other choices", () => {
    const { result } = renderHook(() => useViewPref("rewardsTab"));
    act(() => result.current[1]("board"));
    expect(viewPrefsStore.read()).toEqual({ ...VIEW_DEFAULTS, rewardsTab: "board" });
  });

  it("ignores a stored value that is no longer one of the choices, field by field", () => {
    window.localStorage.setItem("acta_view_prefs", JSON.stringify({ v: 1, d: { portfolioTab: "closed", incomeRange: "7d", vaultRange: 3, portfolioSortOpen: { key: "pnl", dir: "sideways" }, extra: "x" } }));
    expect(viewPrefsStore.read()).toEqual({ ...VIEW_DEFAULTS, incomeRange: "7d" });
  });

  it("keeps a sort as a column and a direction", () => {
    const { result } = renderHook(() => useViewPref("portfolioSortOpen"));
    act(() => result.current[1]({ key: "pnl", dir: "desc" }));
    expect(viewPrefsStore.read().portfolioSortOpen).toEqual({ key: "pnl", dir: "desc" });
  });
});
