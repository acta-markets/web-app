import { useCallback } from "react";
import { createLocalStore, useLocalStore } from "./local-store";

/**
 * How a visitor likes to look at the app's pages, kept on this device: which tab, which
 * range, which order. Small, device-wide and safe to lose. A value that is no longer one of
 * the choices on offer is ignored when it is read, so removing an option needs no migration.
 *
 * A choice belongs here when it is a habit. What defines the view someone might link to
 * (which asset, which league) goes in the address instead.
 */

const oneOf = <T extends string>(...values: readonly T[]) => (value: unknown): T | undefined =>
  typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : undefined;
const bool = (value: unknown): boolean | undefined => (typeof value === "boolean" ? value : undefined);
const shortText = (value: unknown): string | undefined => (typeof value === "string" && value.length <= 64 ? value : undefined);
const sort = (value: unknown): { key: string; dir: "asc" | "desc" } | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const { key, dir } = value as Record<string, unknown>;
  return typeof key === "string" && key.length <= 24 && (dir === "asc" || dir === "desc") ? { key, dir } : undefined;
};

/** Every remembered view choice, with the value a first visit sees. */
export const VIEW_DEFAULTS = {
  portfolioTab: "open" as "open" | "history",
  portfolioSortOpen: null as { key: string; dir: "asc" | "desc" } | null,
  portfolioSortHistory: null as { key: string; dir: "asc" | "desc" } | null,
  incomeRange: "30d" as "7d" | "30d",
  /** Quote mint the income card shows; empty follows the page's default. */
  incomeMint: "",
  rewardsTab: "rules" as "rules" | "board" | "clans" | "awards",
  rewardsWholeSeason: false,
  /** Point currency id; empty follows the league's first. */
  rewardsCurrency: "",
  vaultSeries: "return" as "return" | "tvl",
  vaultRange: "all" as "1m" | "3m" | "all",
};

export type ViewPrefs = typeof VIEW_DEFAULTS;
export type ViewPref = keyof ViewPrefs;

const CHECKS: { [K in ViewPref]: (value: unknown) => ViewPrefs[K] | undefined } = {
  portfolioTab: oneOf("open", "history"),
  portfolioSortOpen: sort,
  portfolioSortHistory: sort,
  incomeRange: oneOf("7d", "30d"),
  incomeMint: shortText,
  rewardsTab: oneOf("rules", "board", "clans", "awards"),
  rewardsWholeSeason: bool,
  rewardsCurrency: shortText,
  vaultSeries: oneOf("return", "tvl"),
  vaultRange: oneOf("1m", "3m", "all"),
};

function parse(data: unknown): ViewPrefs | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const stored = data as Record<string, unknown>;
  const prefs: Record<string, unknown> = { ...VIEW_DEFAULTS };
  for (const name of Object.keys(CHECKS) as ViewPref[]) {
    const value = CHECKS[name](stored[name]);
    if (value !== undefined) prefs[name] = value;
  }
  return prefs as ViewPrefs;
}

export const viewPrefsStore = createLocalStore<ViewPrefs>({ key: "acta_view_prefs", version: 1, fallback: VIEW_DEFAULTS, parse });

/** One remembered choice and its setter, used like `useState`. */
export function useViewPref<K extends ViewPref>(name: K): [ViewPrefs[K], (value: ViewPrefs[K]) => void] {
  const prefs = useLocalStore(viewPrefsStore);
  const set = useCallback(
    (value: ViewPrefs[K]) => {
      const current = viewPrefsStore.read();
      if (current[name] !== value) viewPrefsStore.write({ ...current, [name]: value });
    },
    [name],
  );
  return [prefs[name], set];
}
