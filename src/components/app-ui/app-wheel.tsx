"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import type { AppInlineSelectOption } from "./app-inline-select";

/** One row's height, and how much of the row before and the row after shows, in the text's own em. */
const ROW_EM = 1.2;
const PEEK_EM = 0.95;
/** How long the wheel must rest before its row counts as chosen, where the browser has no `scrollend`. */
const SETTLE_MS = 150;
/** A press that travels less than this is a click on a row, not a drag of the wheel. */
const DRAG_START_PX = 3;
/** How far a mouse wheel or a trackpad must turn for one row, and the pause before the next row. */
const WHEEL_STEP_PX = 24;
const WHEEL_PAUSE_MS = 160;
/** Wheel events closer together than this are one turn of the hand. */
const WHEEL_GESTURE_MS = 250;

/** The nearest row that can be chosen, stepping from `from` by `by`; -1 when there is none. */
function stepFrom(options: ReadonlyArray<AppInlineSelectOption>, from: number, by: 1 | -1): number {
  for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i].disabled) return i;
  return -1;
}

const EDGE = (PEEK_EM / (ROW_EM + 2 * PEEK_EM)) * 100;
/** Full ink on the centre row; the rows before and after fade toward the wheel's edges. */
const MASK = `linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.7) ${EDGE}%, #000 ${EDGE}%, #000 ${100 - EDGE}%, rgba(0,0,0,0.7) ${100 - EDGE}%, rgba(0,0,0,0.25) 100%)`;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** The row under the wheel's centre for a scroll position. Rows are one height; the first is centred at zero. */
export function wheelIndex(scrollTop: number, rowHeight: number, count: number): number {
  if (count <= 0 || !(rowHeight > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / rowHeight)));
}

/**
 * A wheel set in a line of text, turned like the time wheel of a phone's alarm: the chosen
 * value sits on the line between two hairlines, the value before and the value after show
 * faded above and below it. It is a real scroll box with scroll snap, so a thumb gets the
 * platform's own flick and settle. A mouse wheel or a trackpad turns it a row at a time, a
 * mouse can drag it, a click on a faded row brings that row in, and the arrow keys step it.
 *
 * The row under the centre is reported once the wheel rests, not on the way past: a new value
 * usually reloads what depends on it. It keeps the width of its widest value, so turning it
 * never reflows the line.
 */
export function AppWheel({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: {
  /** what the wheel sets, for assistive tech */
  label: string;
  value: string;
  options: ReadonlyArray<AppInlineSelectOption>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = React.useId();
  const scroller = React.useRef<HTMLSpanElement>(null);
  const found = options.findIndex((o) => o.value === value);
  const selected = found < 0 ? 0 : found;

  // what the scroll and pointer listeners read: they outlive the render that attached them
  const latest = React.useRef({ options, value, selected, onChange, disabled });
  useIsomorphicLayoutEffect(() => {
    latest.current = { options, value, selected, onChange, disabled };
  });

  const drag = React.useRef<{ moved: boolean } | null>(null);
  const touching = React.useRef(false);
  const swallowClick = React.useRef(false);
  const mounted = React.useRef(false);

  const rowHeight = React.useCallback(() => {
    const row = scroller.current?.firstElementChild;
    return row ? row.getBoundingClientRect().height : 0;
  }, []);

  /** Bring a row to the centre. Without layout (a test, a hidden tab) there is nothing to move. */
  const moveTo = React.useCallback((index: number, smooth: boolean) => {
    const el = scroller.current;
    const height = rowHeight();
    if (!el || !(height > 0)) return;
    const top = index * height;
    if (Math.abs(el.scrollTop - top) < 1) return;
    const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollTo === "function") el.scrollTo({ top, behavior: smooth && !calm ? "smooth" : "auto" });
    else el.scrollTop = top;
  }, [rowHeight]);

  // The value changed from outside (another asset, a restored draft, a click, a key): turn to
  // it. A change the wheel reported itself finds the row already under the centre and leaves
  // the scroll alone, so it never pulls against a thumb or the snap that is finishing.
  useIsomorphicLayoutEffect(() => {
    const el = scroller.current;
    const height = rowHeight();
    if (el && height > 0 && wheelIndex(el.scrollTop, height, options.length) !== selected) moveTo(selected, mounted.current);
    mounted.current = true;
  }, [selected, options.length, moveTo, rowHeight]);

  // the row's height follows the type's size, which follows the card's width
  React.useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!drag.current?.moved && !touching.current) moveTo(latest.current.selected, false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [moveTo]);

  // The wheel has come to rest: the row under the centre is the choice.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const settle = () => {
      if (drag.current?.moved || touching.current) return;
      const now = latest.current;
      const height = rowHeight();
      if (now.disabled || !(height > 0)) return;
      const option = now.options[wheelIndex(el.scrollTop, height, now.options.length)];
      if (!option) return;
      if (option.disabled) moveTo(now.selected, true);
      else if (option.value !== now.value) now.onChange(option.value);
    };
    const rest = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    const touchStart = () => {
      touching.current = true;
    };
    const touchEnd = () => {
      touching.current = false;
      rest();
    };
    el.addEventListener("scroll", rest, { passive: true });
    el.addEventListener("scrollend", settle);
    el.addEventListener("touchstart", touchStart, { passive: true });
    el.addEventListener("touchend", touchEnd);
    el.addEventListener("touchcancel", touchEnd);
    return () => {
      if (timer) clearTimeout(timer);
      el.removeEventListener("scroll", rest);
      el.removeEventListener("scrollend", settle);
      el.removeEventListener("touchstart", touchStart);
      el.removeEventListener("touchend", touchEnd);
      el.removeEventListener("touchcancel", touchEnd);
    };
  }, [moveTo, rowHeight]);

  // A mouse wheel's notch is several rows of scroll, and the snap would let it run to the last
  // row. So the wheel is stepped here: one row for each turn of at least a row's worth, then a
  // short pause. At an end the turn is left to the page, unless it is the tail of the turn that
  // brought the wheel there.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let turned = 0;
    let lastAt = 0;
    let pausedUntil = 0;
    let owned = false;
    const onWheel = (event: WheelEvent) => {
      const now = latest.current;
      if (now.disabled || event.ctrlKey) return;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 100 : event.deltaY;
      if (delta === 0 || Math.abs(delta) < Math.abs(event.deltaX)) return;
      const by = delta > 0 ? 1 : -1;
      const at = event.timeStamp;
      if (at - lastAt > WHEEL_GESTURE_MS) {
        turned = 0;
        owned = false;
      }
      lastAt = at;
      const next = stepFrom(now.options, now.selected, by);
      if (next < 0) {
        if (owned) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (Math.sign(turned) !== by) turned = 0;
      if (at < pausedUntil) return;
      turned += delta;
      if (Math.abs(turned) < WHEEL_STEP_PX) return;
      turned = 0;
      owned = true;
      pausedUntil = at + WHEEL_PAUSE_MS;
      now.onChange(now.options[next].value);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const choose = (index: number) => {
    const option = options[index];
    if (disabled || !option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    else moveTo(index, true);
  };

  const step = (from: number, by: 1 | -1) => stepFrom(options, from, by);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight" ? step(selected, 1)
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? step(selected, -1)
      : event.key === "Home" ? step(-1, 1)
      : event.key === "End" ? step(options.length, -1)
      : null;
    if (next == null) return;
    event.preventDefault();
    if (next >= 0) choose(next);
  };

  // A thumb scrolls the box itself. A mouse has no such gesture, so a press and a pull turn it.
  // The pull is followed on the window: a quick one has left the wheel before its first move.
  const release = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => release.current?.(), []);
  const onPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (disabled || event.pointerType !== "mouse" || event.button !== 0) return;
    const el = event.currentTarget;
    const held = { pointer: event.pointerId, y: event.clientY, top: el.scrollTop, moved: false };
    const onMove = (move: PointerEvent) => {
      if (move.pointerId !== held.pointer) return;
      const pulled = move.clientY - held.y;
      if (!held.moved) {
        if (Math.abs(pulled) < DRAG_START_PX) return;
        held.moved = true;
        // the snap would pull every step of the drag back to a row
        el.style.scrollSnapType = "none";
      }
      el.scrollTop = held.top - pulled;
    };
    const onEnd = (end: PointerEvent) => {
      if (end.pointerId !== held.pointer) return;
      release.current?.();
      if (!held.moved) return;
      // the click that ends a drag lands on whichever row is under the pointer: not a choice
      swallowClick.current = true;
      setTimeout(() => {
        swallowClick.current = false;
      }, 0);
      const now = latest.current;
      const index = wheelIndex(el.scrollTop, rowHeight(), now.options.length);
      const target = now.options[index]?.disabled ? now.selected : index;
      moveTo(target, true);
      el.style.scrollSnapType = "";
      const option = now.options[target];
      if (option && !now.disabled && option.value !== now.value) now.onChange(option.value);
    };
    release.current?.();
    drag.current = held;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    release.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
      drag.current = null;
      release.current = null;
    };
  };

  return (
    <span
      className={cn("relative inline-block align-baseline", disabled && "opacity-60", className)}
      style={{ paddingBlock: `${PEEK_EM}em`, lineHeight: ROW_EM }}
    >
      {/* in the line's flow: every value in one cell, so the wheel is as wide as its widest
          value and its centre row sits on the sentence's baseline. Before the values arrive
          it is the pending mark, in the open. */}
      <span aria-hidden="true" className={cn("inline-grid px-[0.3em]", options.length > 0 ? "invisible" : "text-content-secondary")}>
        {options.length > 0 ? (
          options.map((o) => (
            <span key={o.value} className="col-start-1 row-start-1 whitespace-nowrap">
              {o.label}
            </span>
          ))
        ) : (
          <span>&hellip;</span>
        )}
      </span>
      {/* the band the chosen value sits in */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 border-y border-additional-violet-primary-deep bg-[rgba(114,81,247,0.16)]"
        style={{ top: `${PEEK_EM}em`, height: `${ROW_EM}em` }}
      />
      <span
        ref={scroller}
        role="listbox"
        aria-label={label}
        aria-orientation="vertical"
        aria-disabled={disabled || undefined}
        aria-activedescendant={options[selected] ? `${id}-${selected}` : undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className={cn(
          "absolute inset-0 block select-none snap-y snap-mandatory overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
          "motion-reduce:[scroll-behavior:auto]",
          disabled ? "pointer-events-none overflow-y-hidden" : "cursor-grab overflow-y-auto active:cursor-grabbing"
        )}
        style={{ paddingBlock: `${PEEK_EM}em`, maskImage: MASK, WebkitMaskImage: MASK }}
      >
        {options.map((o, i) => (
          <span
            key={o.value}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === selected}
            aria-disabled={o.disabled || undefined}
            title={o.detail}
            onClick={() => {
              if (!swallowClick.current) choose(i);
            }}
            className={cn("block snap-center whitespace-nowrap px-[0.3em] text-center", o.disabled && "opacity-50")}
            style={{ height: `${ROW_EM}em` }}
          >
            {o.label}
          </span>
        ))}
      </span>
    </span>
  );
}
