"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export type AppInlineSelectOption = {
  value: string;
  label: string;
  /** secondary text: right-aligned in the menu, after a dot in the phone picker */
  detail?: string;
  /** shown before the label in the menu only */
  icon?: React.ReactNode;
  disabled?: boolean;
};

/** Phones keep the platform picker; wider screens get the styled menu. */
const MENU_QUERY = "(min-width: 768px)";
const MENU_GAP = 6;

const FACE = "col-start-1 row-start-1 inline-flex items-center gap-[0.15em]";
const PILL =
  "relative inline-flex items-center gap-[0.15em] whitespace-nowrap border px-[0.25em] py-[0.06em] leading-[1.15] transition-colors";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? React.useEffect : React.useLayoutEffect;

/** False on the server and until mounted, so the first render always uses the platform picker. */
function useMenuMode() {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(MENU_QUERY);
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

function nativeLabel(o: AppInlineSelectOption) {
  return o.detail ? `${o.label} · ${o.detail}` : o.label;
}

/**
 * An inline pill that picks one value. On phones it lays an invisible native <select>
 * over the face, so the platform's own picker opens; from 768px it opens a styled,
 * keyboard-driven menu instead. Both modes render the same face, so switching never
 * changes the pill's size.
 */
export function AppInlineSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  reserve,
  children
}: {
  /** accessible name of the select */
  label: string;
  value: string;
  options: ReadonlyArray<AppInlineSelectOption>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** faces of every value the pill can show; it keeps the widest one's width, so picking never reflows the text around it */
  reserve?: ReadonlyArray<{ key: string; face: React.ReactNode }>;
  children: React.ReactNode;
}) {
  const menu = useMenuMode();
  const face = (
    <>
      {reserve?.length ? (
        <span className="inline-grid">
          {reserve.map((r) => (
            <span key={r.key} aria-hidden="true" className={cn(FACE, "invisible")}>
              {r.face}
            </span>
          ))}
          <span className={FACE}>{children}</span>
        </span>
      ) : (
        children
      )}
      <ChevronDown aria-hidden="true" className="h-[0.4em] w-[0.4em] shrink-0 opacity-50" />
    </>
  );

  if (menu) {
    return (
      <MenuSelect label={label} value={value} options={options} onChange={onChange} disabled={disabled} className={className}>
        {face}
      </MenuSelect>
    );
  }

  return (
    <span
      data-pill={label}
      className={cn(
        PILL,
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-primary",
        disabled ? "opacity-60" : "cursor-pointer",
        className
      )}
    >
      {face}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none text-base opacity-0 [color-scheme:dark] disabled:cursor-not-allowed"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {nativeLabel(o)}
          </option>
        ))}
      </select>
    </span>
  );
}

function MenuSelect({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  children
}: {
  label: string;
  value: string;
  options: ReadonlyArray<AppInlineSelectOption>;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [position, setPosition] = React.useState<{ left: number; top: number; minWidth: number } | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const id = React.useId();
  const listId = `${id}-list`;
  const selectedIndex = options.findIndex((o) => o.value === value);

  // the next enabled option from `from` in direction `step`, wrapping; `from` itself when none is
  const step = React.useCallback(
    (from: number, by: 1 | -1) => {
      let i = from;
      for (let n = 0; n < options.length; n += 1) {
        i = (i + by + options.length) % options.length;
        if (!options[i].disabled) return i;
      }
      return from;
    },
    [options]
  );

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex >= 0 && !options[selectedIndex].disabled ? selectedIndex : step(-1, 1));
    setOpen(true);
  };
  const choose = (i: number) => {
    const option = options[i];
    if (!option || option.disabled) return;
    setOpen(false);
    buttonRef.current?.focus();
    if (option.value !== value) onChange(option.value);
  };

  // below the pill, or above it when there is no room, kept inside the viewport
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const place = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      const list = listRef.current;
      if (!trigger || !list) return;
      const roomBelow = window.innerHeight - trigger.bottom - MENU_GAP;
      const top = roomBelow >= list.offsetHeight || trigger.top < list.offsetHeight + MENU_GAP
        ? trigger.bottom + MENU_GAP
        : trigger.top - MENU_GAP - list.offsetHeight;
      const width = Math.max(list.offsetWidth, trigger.width);
      const left = Math.min(Math.max(MENU_GAP, trigger.left), window.innerWidth - width - MENU_GAP);
      setPosition({ left, top, minWidth: trigger.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  React.useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, id]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => step(i, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? step(-1, 1) : step(options.length, -1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      // typeahead: the next option whose label starts with the typed character
      const key = e.key.toLowerCase();
      for (let n = 1; n <= options.length; n += 1) {
        const i = (active + n) % options.length;
        if (!options[i].disabled && options[i].label.toLowerCase().startsWith(key)) {
          setActive(i);
          break;
        }
      }
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-pill={label}
        disabled={disabled}
        aria-label={`${label}: ${options[selectedIndex]?.label ?? ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${id}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          PILL,
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-primary",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className
        )}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={label}
              style={{ left: position?.left ?? 0, top: position?.top ?? 0, minWidth: position?.minWidth, visibility: position ? "visible" : "hidden" }}
              className="fixed z-[80] max-h-[min(320px,60vh)] overflow-y-auto border border-bg-border bg-bg-primary py-1 font-mono text-sm leading-[1.2] tracking-[-0.28px] shadow-[0_16px_16px_4px_rgba(18,18,18,0.32)]"
            >
              {options.map((o, i) => {
                const selected = o.value === value;
                return (
                  <li
                    key={o.value}
                    id={`${id}-${i}`}
                    role="option"
                    aria-selected={selected}
                    aria-disabled={o.disabled || undefined}
                    data-value={o.value}
                    // keep focus on the pill, which owns the keyboard
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerEnter={() => {
                      if (!o.disabled) setActive(i);
                    }}
                    onClick={() => choose(i)}
                    className={cn(
                      "flex items-center gap-2 whitespace-nowrap px-3 py-2",
                      o.disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
                      i === active && !o.disabled && "bg-action-primary"
                    )}
                  >
                    {o.icon}
                    <span className={selected ? "text-accent-secondary" : "text-content-primary"}>{o.label}</span>
                    {o.detail ? <span className="ml-auto pl-6 text-content-secondary">{o.detail}</span> : <span className="ml-auto" />}
                    <Check aria-hidden="true" className={cn("ml-2 h-3.5 w-3.5 shrink-0 text-accent-secondary", !selected && "invisible")} />
                  </li>
                );
              })}
            </ul>,
            document.body
          )
        : null}
    </>
  );
}
