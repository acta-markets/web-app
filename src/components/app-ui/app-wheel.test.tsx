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

const wheel = () => screen.getByRole("listbox", { name: "Expiry" });
const row = (name: string) => screen.getByRole("option", { name });

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
  it("lists every value and marks the chosen one", () => {
    render(<AppWheel label="Expiry" value="2" options={dates} onChange={vi.fn()} />);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Jan 22", "Jan 29", "Feb 5"]);
    expect(row("Jan 29").getAttribute("aria-selected")).toBe("true");
    expect(row("Jan 22").getAttribute("aria-selected")).toBe("false");
    expect(wheel().getAttribute("aria-activedescendant")).toBe(row("Jan 29").id);
  });

  it("takes a click on a row before or after as the choice", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="2" options={dates} onChange={onChange} />);
    fireEvent.click(row("Feb 5"));
    expect(onChange).toHaveBeenCalledWith("3");
    // the chosen row is already the choice
    onChange.mockClear();
    fireEvent.click(row("Jan 29"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("steps with the arrow keys and jumps with Home and End, never past an end", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="1" options={dates} onChange={onChange} />);
    fireEvent.keyDown(wheel(), { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("2");
    fireEvent.keyDown(wheel(), { key: "End" });
    expect(onChange).toHaveBeenLastCalledWith("3");
    onChange.mockClear();
    // already on the first row
    fireEvent.keyDown(wheel(), { key: "ArrowUp" });
    fireEvent.keyDown(wheel(), { key: "Home" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("skips a value that cannot be chosen", () => {
    const onChange = vi.fn();
    const options = [dates[0], { ...dates[1], disabled: true }, dates[2]];
    render(<AppWheel label="Expiry" value="1" options={options} onChange={onChange} />);
    fireEvent.click(row("Jan 29"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(wheel(), { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("3");
  });

  it("reports the row under the centre once the wheel rests, not on the way past", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="1" options={dates} onChange={onChange} />);
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
  });

  it("turns one row for a notch of a mouse wheel, and leaves a turn past the end to the page", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AppWheel label="Expiry" value="2" options={dates} onChange={onChange} />);
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
    // the tail of the turn that reached the last row is kept from the page
    expect(turn(120, 1100)).toBe(false);
    // a new turn on the last row is not taken: the page scrolls
    expect(turn(120, 5000)).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    // and back up
    expect(turn(-120, 9000)).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith("2");
  });

  it("does nothing while disabled", () => {
    const onChange = vi.fn();
    render(<AppWheel label="Expiry" value="1" options={dates} onChange={onChange} disabled />);
    expect(wheel().getAttribute("aria-disabled")).toBe("true");
    expect(wheel().tabIndex).toBe(-1);
    fireEvent.click(row("Jan 29"));
    fireEvent.keyDown(wheel(), { key: "ArrowDown" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows a placeholder width while it has no values", () => {
    render(<AppWheel label="Expiry" value="" options={[]} onChange={vi.fn()} />);
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(wheel().getAttribute("aria-activedescendant")).toBeNull();
  });
});
