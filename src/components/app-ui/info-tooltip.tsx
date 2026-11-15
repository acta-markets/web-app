"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;
const GAP = 8;

// a tap or click focuses the button too; only keyboard focus should open the tip from here
function focusedByKeyboard(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

/**
 * An (i) that explains the label next to it. Hover or keyboard focus opens it;
 * a tap or a key press toggles it. Rendered on <body> so clipping cards and modals
 * cannot cut it off, at z-[150]: above modals (90), below toasts (200).
 */
export function InfoTooltip({
  label,
  children,
  className,
}: {
  /** accessible name of the (i) button */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<{ left: number; top: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tipRef = React.useRef<HTMLDivElement>(null);
  const lastPointer = React.useRef("");
  /** when the tip last moved the page to make room for itself; that scroll must not close it */
  const madeRoomAt = React.useRef(0);
  const id = React.useId();

  // Measure once the tip is in the DOM. It opens below the (i) and runs to the right from its
  // left edge, never above it (STYLE.md), and is kept on screen: short of room on the right it
  // slides left; short of room below it stays as low as it fits and steps to the right of the
  // (i), so it does not sit on top of the thing it explains.
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const tip = tipRef.current;
    if (!triggerRef.current || !tip) return;
    let trigger = triggerRef.current.getBoundingClientRect();
    // Opened by a tap or a key with no room underneath: the page moves up just enough for the
    // tip to fit below, as a selector's menu does. A mouse is left alone, since moving the page
    // under the pointer would close the tip it just opened.
    const short = trigger.bottom + GAP + tip.offsetHeight + GAP - window.innerHeight;
    if (short > 0 && lastPointer.current !== "mouse") {
      madeRoomAt.current = performance.now();
      window.scrollBy({ top: short, behavior: "instant" });
      trigger = triggerRef.current.getBoundingClientRect();
    }
    const below = trigger.bottom + GAP;
    const top = Math.min(below, Math.max(GAP, window.innerHeight - tip.offsetHeight - GAP));
    const maxLeft = window.innerWidth - tip.offsetWidth - GAP;
    const beside = trigger.right + GAP;
    const wanted = top < below && beside <= maxLeft ? beside : trigger.left;
    const left = Math.max(GAP, Math.min(wanted, maxLeft));
    setPosition({ left, top });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onScroll = () => {
      if (performance.now() - madeRoomAt.current > 300) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onPointerDown={(e) => {
          lastPointer.current = e.pointerType;
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === "mouse") setOpen(true);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setOpen(false);
        }}
        // a mouse already opened it on hover; touch has no hover, so a tap toggles, as does Enter (detail 0)
        onClick={(e) => {
          if (e.detail === 0 || lastPointer.current !== "mouse") setOpen((was) => !was);
        }}
        onFocus={(e) => {
          if (focusedByKeyboard(e.currentTarget)) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        className={cn(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center text-content-secondary transition-colors hover:text-content-primary focus-visible:text-content-primary focus-visible:outline-none",
          className,
        )}
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open
        ? createPortal(
            <div
              ref={tipRef}
              id={id}
              role="tooltip"
              style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden" }}
              className="pointer-events-none fixed z-[150] w-max max-w-[260px] border border-bg-border bg-bg-primary p-3 text-left font-mono text-xs font-normal normal-case leading-[1.4] tracking-normal text-content-primary shadow-[0_16px_16px_4px_rgba(18,18,18,0.32)]"
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
