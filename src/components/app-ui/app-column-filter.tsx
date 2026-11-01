"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

const MENU_WIDTH = 176;

function place(anchor: HTMLElement | null) {
  const rect = anchor?.getBoundingClientRect();
  if (!rect) return null;
  return { top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)) };
}

/** Funnel button for a table header. The menu is portaled: table scroll areas would clip it. */
export function AppColumnFilter<T extends string>({
  label,
  value,
  allValue,
  onChange,
  options,
}: {
  label: string;
  value: T;
  allValue: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string }>;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const open = position !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    // the menu is fixed, so it follows the header through scroll and layout shifts
    const follow = () => setPosition(place(button.current));
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  const toggle = () => {
    setPosition(open ? null : place(button.current));
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={`Filter by ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        className={cn("ml-1.5 inline-flex align-[-2px] hover:text-content-primary", value !== allValue && "text-accent-secondary")}
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill={value !== allValue ? "currentColor" : "none"} stroke="currentColor">
          <path d="M1 1.5h10L7.25 6v3.5l-2.5 1V6L1 1.5Z" strokeLinejoin="round" />
        </svg>
      </button>
      {position ? createPortal(
        <div
          ref={menu}
          role="menu"
          aria-label={`Filter by ${label}`}
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-50 border border-bg-border bg-bg-primary py-1 font-mono text-sm"
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onChange(option.value);
                setPosition(null);
              }}
              className={cn(
                "block w-full px-3 py-2 text-left hover:bg-action-tertiary",
                option.value === value ? "text-accent-secondary" : "text-content-primary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
