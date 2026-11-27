"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Chevron } from "./chevron";
import { INLINE_PILL, INLINE_PILL_FACE, INLINE_PILL_GLYPH, type AppInlineSelectOption } from "./app-inline-select";

/** One row's height, and how much of the row before and the row after shows, in the text's own em. */
const ROW_EM = 1.27;
const PEEK_EM = 1;
/** How long the wheel must rest before its row counts as chosen, where the browser has no `scrollend`. */
const SETTLE_MS = 150;
/** A press that travels less than this is a click on a row, not a drag of the wheel. */
const DRAG_START_PX = 3;
/** How far a mouse wheel or a trackpad must turn for one row, and the pause before the next row. */
const WHEEL_STEP_PX = 24;
const WHEEL_PAUSE_MS = 160;
/** Wheel events closer together than this are one turn of the hand. */
const WHEEL_GESTURE_MS = 250;

const EDGE = (PEEK_EM / (ROW_EM + 2 * PEEK_EM)) * 100;
/** Full ink on the centre row; the rows before and after fade toward the wheel's edges. */
const MASK = `linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.78) ${EDGE * 0.45}%, #000 ${EDGE}%, #000 ${100 - EDGE}%, rgba(0,0,0,0.78) ${100 - EDGE * 0.45}%, transparent 100%)`;

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** The row under the wheel's centre for a scroll position. Rows are one height; the first is centred at zero. */
export function wheelIndex(scrollTop: number, rowHeight: number, count: number): number {
  if (count <= 0 || !(rowHeight > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / rowHeight)));
}

/** The nearest row that can be chosen, stepping from `from` by `by`; -1 when there is none. */
function stepFrom(options: ReadonlyArray<AppInlineSelectOption>, from: number, by: 1 | -1): number {
  for (let i = from + by; i >= 0 && i < options.length; i += by) if (!options[i].disabled) return i;
  return -1;
}

type WheelProps = {
  /** what the wheel sets, for assistive tech */
  label: string;
  value: string;
  options: ReadonlyArray<AppInlineSelectOption>;
  onChange: (value: string) => void;
};

/**
 * A wheel set in a line of text, turned like the time wheel of a phone's alarm. At rest it is
 * a pill in the sentence, like the others, holding the chosen value. A click opens the wheel
 * in place: the chosen value stays where it was, between two hairlines, and the value before
 * and the value after appear faded above and below it. A click on a faded value takes it and
 * closes the wheel; a click on the chosen one, a press outside, Escape or Enter closes it.
 *
 * The pill keeps the width of its widest value, so turning the wheel never reflows the line,
 * and the open wheel lies over the page, so opening it moves nothing either.
 */
export function AppWheel({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: WheelProps & {
  disabled?: boolean;
  /** the pill's colours */
  className?: string;
}) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef<HTMLSpanElement>(null);
  const button = React.useRef<HTMLButtonElement>(null);
  const found = options.findIndex((o) => o.value === value);
  const selected = found < 0 ? 0 : found;
  const current = options[selected] ?? null;
  const usable = !disabled && options.length > 0;
  const isOpen = open && usable;

  // a press anywhere else closes it; a phone does not move focus on a tap, so blur alone would miss it
  React.useEffect(() => {
    if (!isOpen) return;
    const onDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node | null)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [isOpen]);

  const close = React.useCallback(() => {
    setOpen(false);
    button.current?.focus({ preventScroll: true });
  }, []);

  return (
    <span
      ref={anchor}
      className="relative inline-flex"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        data-pill={label}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${id}-wheel` : undefined}
        aria-label={current ? `${label}: ${current.label}` : label}
        disabled={!usable}
        onClick={() => setOpen((was) => !was)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setOpen(true);
        }}
        className={cn(
          INLINE_PILL,
          // on a phone the tap area fills the line's height, not just the word's
          "max-md:after:absolute max-md:after:inset-x-0 max-md:after:-inset-y-1 max-md:after:content-['']",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
          disabled ? "cursor-not-allowed opacity-60" : usable ? "cursor-pointer" : "cursor-default",
          className
        )}
      >
        <span className="inline-grid">
          {options.length > 0 ? (
            options.map((o, i) => (
              <span key={o.value} aria-hidden={i !== selected} className={cn(INLINE_PILL_FACE, i !== selected && "invisible")}>
                {o.label}
              </span>
            ))
          ) : (
            <span className={cn(INLINE_PILL_FACE, "text-content-secondary")}>&hellip;</span>
          )}
        </span>
        {/* the pair pointing apart: the value turns up and down */}
        <Chevron kind="switch" className={INLINE_PILL_GLYPH} />
      </button>
      {isOpen ? (
        <Wheel id={`${id}-wheel`} label={label} value={value} options={options} selected={selected} onChange={onChange} onClose={close} />
      ) : null}
    </span>
  );
}

/**
 * The open wheel, lying over its pill. It is a real scroll box with scroll snap, so a thumb
 * gets the platform's own flick and settle. A mouse wheel or a trackpad turns it a row at a
 * time, a mouse can drag it, and the arrow keys step it. The row under the centre is reported
 * once the wheel rests, not on the way past: a new value usually reloads what depends on it.
 */
function Wheel({
  id,
  label,
  value,
  options,
  selected,
  onChange,
  onClose,
}: WheelProps & { id: string; selected: number; onClose: () => void }) {
  const scroller = React.useRef<HTMLSpanElement>(null);

  // what the scroll and pointer listeners read: they outlive the render that attached them
  const latest = React.useRef({ options, value, selected, onChange });
  useIsomorphicLayoutEffect(() => {
    latest.current = { options, value, selected, onChange };
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

  // It opens on the chosen row, and takes the keyboard. After that, a value changed by a key or
  // from outside turns the wheel to it; a change the wheel reported itself finds the row already
  // under the centre and leaves the scroll alone, so it never pulls against a thumb or the snap.
  useIsomorphicLayoutEffect(() => {
    const el = scroller.current;
    const height = rowHeight();
    if (el && height > 0 && wheelIndex(el.scrollTop, height, options.length) !== selected) moveTo(selected, mounted.current);
    if (!mounted.current) el?.focus({ preventScroll: true });
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
      if (!(height > 0)) return;
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
  // short pause. The open wheel keeps every turn; the page under it does not move.
  React.useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    let turned = 0;
    let lastAt = 0;
    let pausedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      const now = latest.current;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * 100 : event.deltaY;
      if (delta === 0 || Math.abs(delta) < Math.abs(event.deltaX)) return;
      const by = delta > 0 ? 1 : -1;
      const at = event.timeStamp;
      if (at - lastAt > WHEEL_GESTURE_MS || Math.sign(turned) !== by) turned = 0;
      lastAt = at;
      const next = stepFrom(now.options, now.selected, by);
      if (next < 0 || at < pausedUntil) return;
      turned += delta;
      if (Math.abs(turned) < WHEEL_STEP_PX) return;
      turned = 0;
      pausedUntil = at + WHEEL_PAUSE_MS;
      now.onChange(now.options[next].value);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClose();
      return;
    }
    const next =
      event.key === "ArrowDown" || event.key === "ArrowRight" ? stepFrom(options, selected, 1)
      : event.key === "ArrowUp" || event.key === "ArrowLeft" ? stepFrom(options, selected, -1)
      : event.key === "Home" ? stepFrom(options, -1, 1)
      : event.key === "End" ? stepFrom(options, options.length, -1)
      : null;
    if (next == null) return;
    event.preventDefault();
    if (next >= 0 && options[next].value !== value) onChange(options[next].value);
  };

  // A thumb scrolls the box itself. A mouse has no such gesture, so a press and a pull turn it.
  // The pull is followed on the window: a quick one has left the wheel before its first move.
  const release = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => release.current?.(), []);
  const onPointerDown = (event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
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
      if (option && option.value !== now.value) now.onChange(option.value);
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

  /** A click on a row: the chosen one closes the wheel, another is taken and closes it. */
  const pick = (index: number) => {
    const option = options[index];
    if (swallowClick.current || !option || option.disabled) return;
    if (option.value !== value) onChange(option.value);
    onClose();
  };

  return (
    // over the pill, one border wider on each side, so a row's text lies exactly on the pill's
    <span
      className="absolute -inset-x-px top-1/2 z-30 block -translate-y-1/2 bg-bg-primary shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
      style={{ height: `calc(${ROW_EM + 2 * PEEK_EM}em + 2px)`, lineHeight: ROW_EM }}
    >
      {/* the band the chosen value sits in, with the pill's own mark */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 flex items-center justify-end border-y border-additional-violet-primary-deep bg-[rgba(114,81,247,0.2)] px-[0.25em]"
        style={{ top: `${PEEK_EM}em`, height: `${ROW_EM}em` }}
      >
        <Chevron kind="switch" className="h-[0.55em] w-[0.55em] shrink-0" />
      </span>
      <span
        ref={scroller}
        id={id}
        role="listbox"
        aria-label={label}
        aria-orientation="vertical"
        aria-activedescendant={options[selected] ? `${id}-${selected}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        className={cn(
          "absolute inset-0 block cursor-grab select-none snap-y snap-mandatory overflow-y-auto overflow-x-hidden overscroll-contain active:cursor-grabbing",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none motion-reduce:[scroll-behavior:auto]"
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
            onClick={() => pick(i)}
            className={cn("flex snap-center items-center whitespace-nowrap px-[0.25em]", o.disabled && "opacity-50")}
            style={{ height: `${ROW_EM}em` }}
          >
            {o.label}
          </span>
        ))}
      </span>
    </span>
  );
}
