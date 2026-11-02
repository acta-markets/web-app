"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActaWsClient, PositionInfo } from "@/lib/rfq-client";
import { fetchWalletPositions, fetchWalletPositionSummary, type WalletPositionSummary } from "@/lib/portfolio-api";

const PAGE_SIZE = 50;
const EMPTY_POSITIONS: PositionInfo[] = [];
type HistoryState = {
  wallet: string | null;
  positions: PositionInfo[];
  nextCursor: string | null;
  loading: boolean;
  failed: boolean;
};
const emptyState = (wallet: string | null): HistoryState => ({ wallet, positions: EMPTY_POSITIONS, nextCursor: null, loading: !!wallet, failed: false });

export function useWalletHistory(wallet: string | null, livePositions: PositionInfo[], getClient: () => ActaWsClient | null) {
  const [state, setState] = useState<HistoryState>(() => emptyState(wallet));
  const [totals, setTotals] = useState<{ wallet: string | null; summary: WalletPositionSummary[] | null; failed: boolean }>({ wallet, summary: null, failed: false });
  const request = useRef<{ controller: AbortController; loading: boolean } | null>(null);
  // Ordinary live updates must not discard pages or abort an in-flight Show more.
  // A newly observed terminal position invalidates the settled-history snapshot.
  const terminalRevision = livePositions.filter(p => p.state === "settled" || p.state === "liquidated")
    .map(p => `${p.pda}:${JSON.stringify(p.revision)}`).sort().join("|");

  useEffect(() => {
    const controller = new AbortController();
    const current = { controller, loading: true };
    request.current = current;
    setState(emptyState(wallet));
    const client = getClient();
    if (!wallet || !client) return () => controller.abort();
    void fetchWalletPositions(client, { settled: true, limit: PAGE_SIZE }, controller.signal).then(page => {
      if (!controller.signal.aborted) setState({ wallet, positions: page.positions, nextCursor: page.next_cursor, loading: false, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setState({ ...emptyState(wallet), loading: false, failed: true });
    }).finally(() => { current.loading = false; });
    return () => controller.abort();
  }, [wallet, terminalRevision, getClient]);

  useEffect(() => {
    const controller = new AbortController();
    const client = getClient();
    if (!wallet || !client) {
      setTotals({ wallet, summary: null, failed: false });
      return () => controller.abort();
    }
    void fetchWalletPositionSummary(client, controller.signal).then(summary => {
      if (!controller.signal.aborted) setTotals({ wallet, summary, failed: false });
    }).catch(() => {
      if (!controller.signal.aborted) setTotals({ wallet, summary: null, failed: true });
    });
    return () => controller.abort();
  }, [wallet, livePositions, getClient]);

  const loadMore = useCallback(async () => {
    const current = request.current;
    const client = getClient();
    if (!client || !wallet || state.wallet !== wallet || !state.nextCursor || !current || current.loading || current.controller.signal.aborted) return;
    current.loading = true;
    setState(previous => ({ ...previous, loading: true }));
    try {
      const page = await fetchWalletPositions(client, { settled: true, limit: PAGE_SIZE, cursor: state.nextCursor }, current.controller.signal);
      if (!current.controller.signal.aborted) setState(previous => {
        const seen = new Set(previous.positions.map(p => p.pda));
        return { ...previous, positions: [...previous.positions, ...page.positions.filter(p => !seen.has(p.pda))], nextCursor: page.next_cursor, loading: false, failed: false };
      });
    } catch {
      if (!current.controller.signal.aborted) setState(previous => ({ ...previous, loading: false, failed: true }));
    } finally { current.loading = false; }
  }, [wallet, state.wallet, state.nextCursor, getClient]);

  const visible = state.wallet === wallet ? state : emptyState(wallet);
  return { ...visible, summary: totals.wallet === wallet ? totals.summary : null, failed: visible.failed || (totals.wallet === wallet && totals.failed), loadMore };
}
