/**
 * What the agent has done with funds, kept where a restart can read it. Two jobs: an order
 * that was signed is never signed again after a crash, and a spending limit cannot be reset by
 * restarting the process.
 *
 * The core only knows this interface. A process on a disk appends lines to a file; the site's
 * read-only endpoint has no journal because it moves nothing.
 */
export type JournalState =
  /** a quote was accepted; nothing signed yet */
  | "accepted"
  /** the fill was signed; it may reach the chain */
  | "signed"
  | "confirmed"
  | "failed"
  /** accepted and given up before signing */
  | "abandoned"
  /** sent, outcome not known: never trade around it, look it up */
  | "unknown";

export type JournalEntry = {
  orderId: string;
  rfqId: string;
  state: JournalState;
  /** Unix seconds */
  at: number;
  wallet: string;
  asset: string;
  side: "sell" | "buy";
  /** strike times size, in dollars: what the limits count */
  notionalUsd: number;
  positionPda?: string;
  txSignature?: string;
};

export interface Journal {
  /** Every line, oldest first. */
  read(): Promise<JournalEntry[]>;
  append(entry: JournalEntry): Promise<void>;
}

export function memoryJournal(): Journal {
  const lines: JournalEntry[] = [];
  return {
    read: async () => [...lines],
    append: async (entry) => {
      lines.push(entry);
    },
  };
}

/** The last line of each order: where it stands now. */
export function latestByOrder(entries: JournalEntry[]): JournalEntry[] {
  const last = new Map<string, JournalEntry>();
  for (const entry of entries) last.set(entry.orderId, entry);
  return [...last.values()];
}

/** States that may have moved funds, or still may. */
const COUNTED: ReadonlySet<JournalState> = new Set(["accepted", "signed", "confirmed", "unknown"]);
/** States whose outcome is not settled: look them up before trading again. */
const OPEN: ReadonlySet<JournalState> = new Set(["accepted", "signed", "unknown"]);

/** Dollars of notional this wallet committed since `sinceSec`. */
export function spentSince(entries: JournalEntry[], wallet: string, sinceSec: number): number {
  return latestByOrder(entries)
    .filter((e) => e.wallet === wallet && e.at >= sinceSec && COUNTED.has(e.state))
    .reduce((sum, e) => sum + e.notionalUsd, 0);
}

export function unsettledOrders(entries: JournalEntry[], wallet: string): JournalEntry[] {
  return latestByOrder(entries).filter((e) => e.wallet === wallet && OPEN.has(e.state));
}

/** Entries read back from a file a person may have edited: lines that are not an entry are dropped. */
export function parseJournal(text: string): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as Partial<JournalEntry>;
      if (typeof e.orderId === "string" && typeof e.rfqId === "string" && typeof e.state === "string"
        && typeof e.at === "number" && typeof e.wallet === "string" && typeof e.notionalUsd === "number") {
        entries.push(e as JournalEntry);
      }
    } catch {
      // a torn last line after a crash: the order it described is looked up from its earlier line
    }
  }
  return entries;
}
