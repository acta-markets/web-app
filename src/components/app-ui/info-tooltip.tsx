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
  const id = React.useId();

  // measure once the tip is in the DOM: centred above the (i), below it when there is no room, kept on screen
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current?.getBoundingClientRect();
    const tip = tipRef.current;
    if (!trigger || !tip) return;
    const top = trigger.top - tip.offsetHeight - GAP >= GAP ? trigger.top - tip.offsetHeight - GAP : trigger.bottom + GAP;
    const centred = trigger.left + trigger.width / 2 - tip.offsetWidth / 2;
    const left = Math.min(Math.max(centred, GAP), window.innerWidth - tip.offsetWidth - GAP);
    setPosition({ left, top });
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      if (!triggerRef.current?.contains(e.target as Node)) close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("scroll", close, true);
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
