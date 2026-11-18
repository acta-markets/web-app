/**
 * Last-known data is for display. Anything that builds an order, sizes a deposit or moves
 * funds must be working from data read live in this tab's session and recent enough. This is
 * the one place that decides it.
 */

/** When this tab's JavaScript started. Data older than this was read back from storage. */
export const SESSION_STARTED_AT = Date.now();

export type Timed = {
  /** When the data was fetched, in ms; 0 when there is none. */
  dataUpdatedAt: number;
  /** A refresh failed since: the data is the last that worked. */
  isError?: boolean;
};

/** Read from the network in this session, and no older than `maxAgeMs`. */
export function isLive(read: Timed, maxAgeMs: number, nowMs: number = Date.now(), sessionStartedAt: number = SESSION_STARTED_AT): boolean {
  if (!read.dataUpdatedAt || read.isError) return false;
  if (read.dataUpdatedAt < sessionStartedAt) return false;
  return nowMs - read.dataUpdatedAt <= maxAgeMs;
}

/** Shown from storage and not yet confirmed by a read in this session. */
export function isLastKnown(read: Timed, sessionStartedAt: number = SESSION_STARTED_AT): boolean {
  return read.dataUpdatedAt > 0 && read.dataUpdatedAt < sessionStartedAt;
}

/** Old enough that it should not be shown at all. */
export function isTooOld(read: Timed, maxShowMs: number, nowMs: number = Date.now()): boolean {
  return read.dataUpdatedAt > 0 && nowMs - read.dataUpdatedAt > maxShowMs;
}

/** "as of 14:02" for today, "as of Nov 15" for an older day. */
export function asOfText(atMs: number, nowMs: number = Date.now()): string {
  const at = new Date(atMs);
  const sameDay = new Date(nowMs).toDateString() === at.toDateString();
  return sameDay
    ? `as of ${at.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}`
    : `as of ${at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}
