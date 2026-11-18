import { backendId } from "@/lib/state/keys";
import { createLocalStoreFamily, type LocalStore } from "@/lib/state/local-store";

/**
 * The trade a visitor was setting up on the Trade page, kept on this device so leaving the
 * page (or closing the tab) does not throw it away.
 *
 * Two kinds of thing are in it. Which asset, which way and which mode are habits, and come
 * back for as long as they are stored. The price, the date and the size belong to one
 * moment's trade: they come back for a day, and only for the asset they were chosen for.
 * Whatever comes back is still checked against what the market offers now, by the page's own
 * fallbacks: a date or price no longer listed gives way to the default.
 *
 * Nothing here is an order, a quote or a price that can be traded on. It is what the form
 * showed.
 */

export type TradeDraft = {
  /** Ticker, as the app writes it. */
  asset: string | null;
  direction: "above" | "below" | null;
  mode: "profit" | "yield" | null;
  expiryTs: number | null;
  /** The chosen strike as a price, not a position in a list that may have changed. */
  strike: number | null;
  /** What was typed into the size field. */
  amount: string | null;
  /** The size was entered in the quote token. */
  inQuote: boolean | null;
  /** When the price, date or size were last changed, in ms. */
  savedAt: number;
};

export const EMPTY_DRAFT: TradeDraft = { asset: null, direction: null, mode: null, expiryTs: null, strike: null, amount: null, inQuote: null, savedAt: 0 };

/** How long a price, a date and a size are worth bringing back. */
export const TRADE_DETAILS_KEPT_MS = 24 * 60 * 60 * 1000;

const text = (value: unknown, pattern: RegExp): string | null => (typeof value === "string" && pattern.test(value) ? value : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

function parse(data: unknown): TradeDraft | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const d = data as Record<string, unknown>;
  return {
    asset: text(d.asset, /^[A-Za-z0-9]{1,12}$/),
    direction: d.direction === "above" || d.direction === "below" ? d.direction : null,
    mode: d.mode === "profit" || d.mode === "yield" ? d.mode : null,
    expiryTs: number(d.expiryTs),
    strike: number(d.strike),
    amount: text(d.amount, /^\d{0,12}(\.\d{0,9})?$/),
    inQuote: typeof d.inQuote === "boolean" ? d.inQuote : null,
    savedAt: number(d.savedAt) ?? 0,
  };
}

const drafts = createLocalStoreFamily<TradeDraft>({ prefix: "acta_trade_draft", version: 1, fallback: EMPTY_DRAFT, parse });

/** One draft per backend: devnet's assets and prices are not mainnet's. */
export function tradeDraftStore(backend: string = backendId()): LocalStore<TradeDraft> {
  return drafts(backend);
}

/** Changes part of the draft. A change to the price, the date or the size restarts their day. */
export function updateTradeDraft(store: LocalStore<TradeDraft>, patch: Partial<Omit<TradeDraft, "savedAt">>, nowMs: number = Date.now()): void {
  const current = store.read();
  const next = { ...current, ...patch };
  const detailsChanged = (["expiryTs", "strike", "amount", "inQuote"] as const).some((key) => key in patch && patch[key] !== current[key]);
  if (!detailsChanged && (Object.keys(patch) as Array<keyof TradeDraft>).every((key) => patch[key as keyof typeof patch] === current[key])) return;
  store.write({ ...next, savedAt: detailsChanged ? nowMs : current.savedAt });
}

export type DraftDetails = Pick<TradeDraft, "expiryTs" | "strike" | "amount" | "inQuote">;
const NO_DETAILS: DraftDetails = { expiryTs: null, strike: null, amount: null, inQuote: null };

/**
 * The price, date and size to start the page with. They are used only while they are recent
 * and only for the asset they were chosen for: an address that names another asset starts
 * that asset from its defaults.
 */
export function draftDetails(draft: TradeDraft, asset: string | null | undefined, nowMs: number = Date.now()): DraftDetails {
  const sameAsset = !!draft.asset && !!asset && draft.asset.toLowerCase() === asset.toLowerCase();
  const recent = draft.savedAt > 0 && nowMs - draft.savedAt <= TRADE_DETAILS_KEPT_MS;
  if (!sameAsset || !recent) return NO_DETAILS;
  return { expiryTs: draft.expiryTs, strike: draft.strike, amount: draft.amount, inQuote: draft.inQuote };
}

/** The Trade page's address for a view: `/trade?asset=SOL&dir=below&mode=yield`. Other parameters are kept. */
export function tradeViewSearch(current: string, view: { asset: string | null; direction: "above" | "below" }): string {
  const query = new URLSearchParams(current);
  if (view.asset) query.set("asset", view.asset);
  query.set("dir", view.direction);
  return query.toString();
}
