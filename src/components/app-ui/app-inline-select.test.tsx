import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppInlineSelect } from "./app-inline-select";

afterEach(cleanup);

const options = [
  { value: "above", label: "above ↗" },
  { value: "below", label: "below (no markets)", disabled: true },
];

describe("AppInlineSelect on phones", () => {
  it("shows its face and reports the picked value", () => {
    const onChange = vi.fn();
    render(
      <AppInlineSelect label="Direction" value="above" options={options} onChange={onChange}>
        <span>above</span>
      </AppInlineSelect>
    );
    const select = screen.getByRole("combobox", { name: "Direction" }) as HTMLSelectElement;
    expect(select.value).toBe("above");
    expect(screen.getByText("above")).toBeTruthy();
    expect((screen.getByRole("option", { name: "below (no markets)" }) as HTMLOptionElement).disabled).toBe(true);
    fireEvent.change(select, { target: { value: "above" } });
    expect(onChange).toHaveBeenCalledWith("above");
  });

  it("can be disabled as a whole", () => {
    render(
      <AppInlineSelect label="Date" value="1" options={[{ value: "1", label: "Nov 7" }]} onChange={vi.fn()} disabled>
        <span>Nov 7</span>
      </AppInlineSelect>
    );
    expect((screen.getByRole("combobox", { name: "Date" }) as HTMLSelectElement).disabled).toBe(true);
  });

  it("puts the detail after the label in the platform picker", () => {
    render(
      <AppInlineSelect label="Date" value="1" options={[{ value: "1", label: "Nov 7", detail: "in 8 days" }]} onChange={vi.fn()}>
        <span>Nov 7</span>
      </AppInlineSelect>
    );
    expect(screen.getByRole("option", { name: "Nov 7 · in 8 days" })).toBeTruthy();
  });
});

describe("AppInlineSelect from 768px", () => {
  const assets = [
    { value: "SOL", label: "SOL", detail: "Solana" },
    { value: "ETH", label: "ETH", disabled: true },
    { value: "BTC", label: "BTC" },
    { value: "BONK", label: "BONK" },
  ];

  beforeEach(() => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === "(min-width: 768px)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  function renderAsset(props: Partial<React.ComponentProps<typeof AppInlineSelect>> = {}) {
    const onChange = vi.fn();
    render(
      <AppInlineSelect label="Asset" value="SOL" options={assets} onChange={onChange} {...props}>
        <span>SOL</span>
      </AppInlineSelect>
    );
    return { onChange, pill: screen.getByRole("button", { name: "Asset: SOL" }) };
  }

  it("replaces the platform picker with a menu", () => {
    const { pill } = renderAsset();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(pill.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(pill);
    expect(pill.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("listbox", { name: "Asset" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["SOLSolana", "ETH", "BTC", "BONK"]);
    expect(screen.getByRole("option", { name: /SOL/ }).getAttribute("aria-selected")).toBe("true");
    expect(pill.getAttribute("aria-controls")).toBe(list.id);
  });

  it("picks with the keyboard, skipping disabled options", () => {
    const { pill, onChange } = renderAsset();
    pill.focus();
    fireEvent.keyDown(pill, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
    // opens on the current value, then steps over ETH
    expect(pill.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[0].id);
    fireEvent.keyDown(pill, { key: "ArrowDown" });
    expect(pill.getAttribute("aria-activedescendant")).toBe(screen.getAllByRole("option")[2].id);
    fireEvent.keyDown(pill, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("BTC");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(pill);
  });

  it("wraps, jumps to the ends and finds options by their first letter", () => {
    const { pill } = renderAsset();
    fireEvent.keyDown(pill, { key: "Enter" });
    const ids = screen.getAllByRole("option").map((o) => o.id);
    fireEvent.keyDown(pill, { key: "ArrowUp" });
    expect(pill.getAttribute("aria-activedescendant")).toBe(ids[3]);
    fireEvent.keyDown(pill, { key: "Home" });
    expect(pill.getAttribute("aria-activedescendant")).toBe(ids[0]);
    fireEvent.keyDown(pill, { key: "b" });
    expect(pill.getAttribute("aria-activedescendant")).toBe(ids[2]);
    fireEvent.keyDown(pill, { key: "b" });
    expect(pill.getAttribute("aria-activedescendant")).toBe(ids[3]);
    fireEvent.keyDown(pill, { key: "e" });
    expect(pill.getAttribute("aria-activedescendant")).toBe(ids[3]);
  });

  it("closes without a change on Escape, Tab, a click outside or the current value", () => {
    const { pill, onChange } = renderAsset();
    fireEvent.click(pill);
    fireEvent.keyDown(pill, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(pill);
    fireEvent.keyDown(pill, { key: "Tab" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(pill);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.click(pill);
    fireEvent.click(screen.getByRole("option", { name: /SOL/ }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks by click but ignores disabled options", () => {
    const { pill, onChange } = renderAsset();
    fireEvent.click(pill);
    fireEvent.click(screen.getByRole("option", { name: "ETH" }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option", { name: "BONK" }));
    expect(onChange).toHaveBeenCalledWith("BONK");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("stays shut when disabled or empty", () => {
    const { pill } = renderAsset({ disabled: true });
    expect((pill as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(pill, { key: "ArrowDown" });
    expect(screen.queryByRole("listbox")).toBeNull();
    cleanup();

    render(
      <AppInlineSelect label="Price" value="" options={[]} onChange={vi.fn()}>
        <span>…</span>
      </AppInlineSelect>
    );
    fireEvent.click(screen.getByRole("button", { name: "Price:" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
