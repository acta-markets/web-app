"use client";

import { useEffect } from "react";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import type { TokenMarketsInfoData } from "@/lib/rfq-client";

const REFRESH_MS = 30_000;

/**
 * The `GetTokenMarketsInfo` snapshot (spot, markets, indicative premiums) for one
 * underlying, refreshed every 30s while the tab is visible. Null until a snapshot for
 * this mint arrives, so data for a previously viewed asset never shows.
 */
export function useTokenMarketsSnapshot(underlyingMint: string | null | undefined): TokenMarketsInfoData | null {
  const { tokenMarketsInfo, getTokenMarketsInfo, connectionState } = useRfqContext();
  const mint = underlyingMint?.trim() || null;
  const wsReady = connectionState === "connected" || connectionState === "authenticated";

  useEffect(() => {
    if (!wsReady || !mint) return;
    const refresh = () => {
      if (!document.hidden) getTokenMarketsInfo(mint);
    };
    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [wsReady, mint, getTokenMarketsInfo]);

  return mint && tokenMarketsInfo?.underlyingMint === mint ? tokenMarketsInfo.data : null;
}
