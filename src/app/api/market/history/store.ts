export type PricePoint = [ms: number, price: number];

const DAY_MS = 86_400_000;

/**
 * The last good series per coin and range, held in memory so a rate-limited or failing upstream
 * does not blank the chart. One instance lives for the life of the server process.
 */
export function createHistoryStore() {
  const held = new Map<string, Map<number, PricePoint[]>>();

  return {
    remember(id: string, days: number, points: PricePoint[]) {
      if (points.length === 0) return;
      let byDays = held.get(id);
      if (!byDays) held.set(id, (byDays = new Map()));
      byDays.set(days, points);
    },

    /** The series held for this range, or else the shortest longer one cut down to its window. */
    recall(id: string, days: number, now = Date.now()): PricePoint[] | null {
      const byDays = held.get(id);
      if (!byDays) return null;
      const exact = byDays.get(days);
      if (exact) return exact;
      const longer = [...byDays.keys()].filter((d) => d > days).sort((a, b) => a - b)[0];
      if (longer == null) return null;
      const from = now - days * DAY_MS;
      const cut = byDays.get(longer)!.filter(([ms]) => ms >= from);
      return cut.length > 1 ? cut : null;
    },
  };
}
