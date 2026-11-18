"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ActaWsClient, PositionInfo } from "@/lib/rfq-client";
import { fetchWalletPositions, fetchWalletPositionSummary, type WalletPositionSummary } from "@/lib/portfolio-api";
import { walletKey } from "@/lib/state/keys";
import { remember, useRemembered } from "@/lib/state/remembered";

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

/** The first page of a wallet's settled positions as it is kept for the next visit. */
type RememberedHistory = { positions: PositionInfo[]; nextCursor: string | null };

/**
 * A wallet's settled positions (paged) and its income summary.
 *
 * `wallet` is who to fetch for, which needs a signed-in socket, so it is null until then.
 * `viewWallet` is whose page this is, known earlier: a returning wallet that has not
 * reconnected or signed in yet. For it, what was last loaded is shown from the device until
 * the fresh read arrives; `lastKnown` says so.
 */
export function useWalletHistory(wallet: string | null, livePositions: PositionInfo[], getClient: () => ActaWsClient | null, viewWallet: string | null = wallet) {
  const view = wallet ?? viewWallet;
  const savedHistory = useRemembered<RememberedHistory>(view ? walletKey(view, "history") : null);
  const savedSummary = useRemembered<WalletPositionSummary[]>(view ? walletKey(view, "income-summary") : null);
  const [state, setState] = useState<HistoryState>(() => emptyState(wallet));
  const [totals, setTotals] = useState<{ wallet: string | null; summary: WalletPositionSummary[] | null; failed: boolean }>({ wallet, summary: null, failed: false });
  const request = useRef<{ controller: AbortController; loading: boolean } | null>(null);
  // Ordinary live updates must not discard pages or abort an in-flight Show more.
  // A newly observed terminal position invalidates the settled-history snapshot.
  const terminalRevision = livePositions.filter(p => p.state === "settled" || p.state === "liquidated")
    .map(p => `${p.pda}:${JSON.stringify(p.revision)}`).sort().join("|");
  // The summary only moves when a position opens, funds or closes. A price refresh hands over
  // a new array holding the same positions, and must not refetch it every 15 seconds.
  const liveKey = livePositions.map(p => `${p.pda}:${p.state}`).sort().join("|");

  useEffect(() => {
    const controller = new AbortController();
    const current = { controller, loading: true };
    request.current = current;
    // A refetch for the same wallet (a position has just settled) keeps what is on screen
    // while the new first page loads. Only another wallet starts from nothing.
    setState(previous => (previous.wallet === wallet && wallet && previous.positions.length > 0 ? { ...previous, loading: true, failed: false } : emptyState(wallet)));
    const client = getClient();
    if (!wallet || !client) return () => controller.abort();
    void fetchWalletPositions(client, { settled: true, limit: PAGE_SIZE }, controller.signal).then(page => {
      if (controller.signal.aborted) return;
      setState({ wallet, positions: page.positions, nextCursor: page.next_cursor, loading: false, failed: false });
      remember<RememberedHistory>(walletKey(wallet, "history"), { positions: page.positions, nextCursor: page.next_cursor });
    }).catch(() => {
      if (!controller.signal.aborted) setState(previous => (previous.wallet === wallet ? { ...previous, loading: false, failed: true } : { ...emptyState(wallet), loading: false, failed: true }));
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
    // a refetch for the same wallet keeps the figures on screen until the new ones arrive
    setTotals(previous => (previous.wallet === wallet ? previous : { wallet, summary: null, failed: false }));
    void fetchWalletPositionSummary(client, controller.signal).then(summary => {
      if (controller.signal.aborted) return;
      setTotals({ wallet, summary, failed: false });
      remember(walletKey(wallet, "income-summary"), summary);
    }).catch(() => {
      if (!controller.signal.aborted) setTotals({ wallet, summary: null, failed: true });
    });
    return () => controller.abort();
  }, [wallet, liveKey, getClient]);

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

  const own = state.wallet === wallet ? state : emptyState(wallet);
  const ownSummary = totals.wallet === wallet ? totals.summary : null;
  // Until this session's own read has arrived, what was last loaded for this wallet stands in.
  const historyFromDevice = !!savedHistory.data && (!wallet || (own.loading && own.positions.length === 0));
  const visible: HistoryState = historyFromDevice
    ? { wallet, positions: savedHistory.data!.positions, nextCursor: wallet ? savedHistory.data!.nextCursor : null, loading: own.loading, failed: own.failed }
    : own;
  const summaryFromDevice = ownSummary === null && !!savedSummary.data;
  return {
    ...visible,
    summary: summaryFromDevice ? savedSummary.data! : ownSummary,
    failed: visible.failed || (totals.wallet === wallet && totals.failed),
    loadMore,
    /** Some of what is returned is the last-loaded copy from this device, not yet confirmed in this session. */
    lastKnown: historyFromDevice || summaryFromDevice,
    /** When that copy was loaded, in ms; 0 when nothing is from the device. */
    lastKnownAt: historyFromDevice ? savedHistory.updatedAt : summaryFromDevice ? savedSummary.updatedAt : 0,
  };
}
