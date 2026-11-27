import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppWheel, wheelIndex } from "./app-wheel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const dates = [
  { value: "1", label: "Jan 22", detail: "in 7 days" },
  { value: "2", label: "Jan 29", detail: "in 14 days" },
  { value: "3", label: "Feb 5", detail: "in 21 days" },
];

/** The pill in the sentence. Its name carries the chosen value. */
const pill = () => screen.getByRole("button", { name: /^Expiry/ });
const wheel = () => screen.getByRole("listbox", { name: "Expiry" });
const closed = () => screen.queryByRole("listbox", { name: "Expiry" }) === null;
const row = (name: string) => screen.getByRole("option", { name });
const open = () => fireEvent.click(pill());

describe("wheelIndex", () => {
  it("names the row under the centre", () => {
    expect(wheelIndex(0, 20, 4)).toBe(0);
    expect(wheelIndex(9, 20, 4)).toBe(0);
    expect(wheelIndex(11, 20, 4)).toBe(1);
    expect(wheelIndex(40, 20, 4)).toBe(2);
    expect(wheelIndex(59.6, 19.8, 4)).toBe(3);
  });

  it("stays inside the rows, whatever the scroll position", () => {
    expect(wheelIndex(-30, 20, 4)).toBe(0);
    expect(wheelIndex(900, 20, 4)).toBe(3);
    expect(wheelIndex(40, 0, 4)).toBe(0);
    expect(wheelIndex(Number.NaN, 20, 4)).toBe(0);
    expect(wheelIndex(40, 20, 0)).toBe(0);
  });
});

describe("AppWheel", () => {
  it("rests as a pill with the chosen value and the switch mark, the wheel folded away", () => {
    render(<AppWheel label="Expiry" value="2" options={dates} onChange={vi.fn()} />);
    expect(pill().getAttribute("aria-label")).toBe("Expiry: Jan 29");
    expect(pill().getAttribute("aria-expanded")).toBe("false");
    expect(pill().querySelector("[data-chevron=switch]")).not.toBeNull();
    expect(closed()).toBe(true);
  });

  it("opens on a click, lists every value and marks the chosen one", () => {
    render(<AppWheel label="Expiry" value="2" options={dates} onChange={vi.fn()} />);
    open();
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Jan 22", "Jan 29", "Feb 5"]);
    expect(row("Jan 29").getAttribute("aria-selected")).toBe("true");
    expect(row("Jan 22").getAttribute("aria-selected")).toBe("false");
    expect(wheel().getAttribute("aria-activedescendant")).toBe(row("Jan 29").id);
    // it takes the keyboard
    expect(document.activeElement).toBe(wheel());
  });

  it("takes a click on a row before or after as the choice, and folds", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="2" options={dates} onChange={onChange} />);
    open();
    fireEvent.click(row("Feb 5"));
    expect(onChange).toHaveBeenCalledWith("3");
    expect(closed()).toBe(true);
    expect(document.activeElement).toBe(pill());
  });

  it("folds on a click on the chosen row, on Escape and on a press outside, choosing nothing", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="2" options={dates} onChange={onChange} />);
    open();
    fireEvent.click(row("Jan 29"));
    expect(closed()).toBe(true);
    open();
    fireEvent.keyDown(wheel(), { key: "Escape" });
    expect(closed()).toBe(true);
    open();
    fireEvent.pointerDown(document.body);
    expect(closed()).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens from the keyboard, steps with the arrow keys and jumps with Home and End, never past an end", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="1" options={dates} onChange={onChange} />);
    fireEvent.keyDown(pill(), { key: "ArrowDown" });
    fireEvent.keyDown(wheel(), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("2");
    fireEvent.keyDown(wheel(), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("3");
    onChange.mockClear();
    // already on the first row
    fireEvent.keyDown(wheel(), { key: "ArrowUp" });
    fireEvent.keyDown(wheel(), { key: "Home" });
    expect(onChange).not.toHaveBeenCalled();
    // the keys turn it; they do not fold it
    expect(closed()).toBe(false);
  });

  it("skips a value that cannot be chosen", () => {
    const onChange = vi.fn();
    const options = [dates[0], { ...dates[1], disabled: true }, dates[2]];
    render(<AppWheel label="Expiry" value="1" options={options} onChange={onChange} />);
    open();
    fireEvent.click(row("Jan 29"));
    expect(onChange).not.toHaveBeenCalled();
    expect(closed()).toBe(false);
    fireEvent.keyDown(wheel(), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("reports the row under the centre once the wheel rests, not on the way past", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="1" options={dates} onChange={onChange} />);
    open();
    // jsdom lays nothing out: give the rows a height
    for (const option of screen.getAllByRole("option")) {
      option.getBoundingClientRect = () => ({ height: 20 }) as DOMRect;
    }
    const el = wheel();
    el.scrollTop = 22;
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(100));
    el.scrollTop = 41;
    fireEvent.scroll(el);
    act(() => void vi.advanceTimersByTime(100));
    // still turning: nothing is chosen yet
    expect(onChange).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(100));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("3");
    // a turn chooses; it does not fold the wheel
    expect(closed()).toBe(false);
  });

  it("turns one row for a notch of a mouse wheel, and keeps the turn from the page", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AppWheel label="Expiry" value="2" options={dates} onChange={onChange} />);
    open();
    /** One wheel event at a given time; false when the wheel kept it from the page. */
    const turn = (deltaY: number, at: number) => {
      const event = new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true });
      Object.defineProperty(event, "timeStamp", { value: at });
      return fireEvent(wheel(), event);
    };
    // one notch is several rows of scroll: still one row
    expect(turn(120, 1000)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("3");
    rerender(<AppWheel label="Expiry" value="3" options={dates} onChange={onChange} />);
    onChange.mockClear();
    // on the last row a further turn does nothing, and the page under the wheel stays put
    expect(turn(120, 5000)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
    // and back up
    expect(turn(-120, 9000)).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith("2");
  });

  it("does not open while disabled", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="1" options={dates} onChange={onChange} disabled />);
    expect((pill() as HTMLButtonElement).disabled).toBe(true);
    open();
    fireEvent.keyDown(pill(), { key: "ArrowDown" });
    expect(closed()).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the pending mark and does not open while it has no values", () => {
    render(<AppWheel label="Expiry" value="" options={[]} onChange={vi.fn()} />);
    expect(pill().textContent).toBe("…");
    expect((pill() as HTMLButtonElement).disabled).toBe(true);
    open();
    expect(closed()).toBe(true);
  });
});
