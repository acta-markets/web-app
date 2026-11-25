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
  | "unknown"
  /** counted, and about to be sent by the wallet itself (a vault deposit, an option's funding) */
  | "reserved";

export type JournalEntry = {
  orderId: string;
  rfqId: string;
  state: JournalState;
  /** Unix seconds */
  at: number;
  wallet: string;
  asset: string;
  /**
   * `deposit`: a vault deposit, counted by its dollar value. `fund`: what exercising a bought
   * option costs, paid in. Neither is an order: the venue has nothing to look up for them.
   */
  side: "sell" | "buy" | "deposit" | "fund";
  /** strike times size, in dollars: what the limits count */
  notionalUsd: number;
  positionPda?: string;
  txSignature?: string;
  /** What an order would open, to find its position when the venue has no answer: the market,
   * the strike (1e9) and the size in the asset's atoms. */
  market?: string;
  strike?: string;
  quantity?: string;
};

export interface Journal {
  /** Every line, oldest first. */
  read(): Promise<JournalEntry[]>;
  append(entry: JournalEntry): Promise<void>;
  /**
   * Runs `run` with no other holder inside: not in this process, and not in another one on the
   * same journal. A spend is checked against the limits and written down inside one of these,
   * so two calls in flight cannot each pass alone. Keep it short: nothing on the network.
   */
  lock<T>(run: () => Promise<T>): Promise<T>;
}

/** One at a time, in the order asked. A holder that throws does not stop the next. */
export function serialQueue(): <T>(run: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return (run) => {
    const result = tail.then(run);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

export function memoryJournal(): Journal {
  const lines: JournalEntry[] = [];
  return {
    read: async () => [...lines],
    append: async (entry) => {
      lines.push(entry);
    },
    lock: serialQueue(),
  };
}

/** The last line of each order: where it stands now. */
export function latestByOrder(entries: JournalEntry[]): JournalEntry[] {
  const last = new Map<string, JournalEntry>();
  for (const entry of entries) last.set(entry.orderId, entry);
  return [...last.values()];
}

/** States that may have moved funds, or still may. */
const COUNTED: ReadonlySet<JournalState> = new Set(["accepted", "signed", "confirmed", "unknown", "reserved"]);
/** States whose outcome is not settled: look them up before trading again. */
const OPEN: ReadonlySet<JournalState> = new Set(["accepted", "signed", "unknown"]);

/** Dollars of notional this wallet committed since `sinceSec`. */
export function spentSince(entries: JournalEntry[], wallet: string, sinceSec: number): number {
  return latestByOrder(entries)
    .filter((e) => e.wallet === wallet && e.at >= sinceSec && COUNTED.has(e.state))
    .reduce((sum, e) => sum + e.notionalUsd, 0);
}

/** True while the entry still counts against the limits. */
export const isCounted = (entry: JournalEntry) => COUNTED.has(entry.state);

/** Orders with no final state. A deposit or a funding is not an order and is never one of these. */
export function unsettledOrders(entries: JournalEntry[], wallet: string): JournalEntry[] {
  return latestByOrder(entries).filter((e) => e.wallet === wallet && OPEN.has(e.state) && (e.side === "sell" || e.side === "buy"));
}

/**
 * The newest entry still counted whose id starts with `prefix`: the deposit or the funding that
 * is being taken back, so it stops counting against the day.
 */
export function latestCounted(entries: JournalEntry[], wallet: string, prefix: string): JournalEntry | undefined {
  return latestByOrder(entries).filter((e) => e.wallet === wallet && isCounted(e) && e.orderId.startsWith(prefix)).at(-1);
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
