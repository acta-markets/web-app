"use client";

import { useMemo, useState } from "react";
import { AppCard } from "@/components/app-ui/app-card";
import { useRfqContext } from "@/components/rfq/rfq-provider";
import { useTokenMarketsSnapshot } from "@/components/rfq/use-token-markets-snapshot";
import { formatPct, formatStrikePrice, formatUsdSmart } from "@/lib/markets";
import { pickAsset, tradeAssets } from "@/lib/trade/assets";
import { formatCountdown, formatExpiryDay, formatExpiryUtc } from "@/lib/trade/format";
import {
  buildStrikeOptions,
  defaultStrikeIndex,
  indicativesFor,
  spotFromSnapshot,
  tradableExpiries,
} from "@/lib/trade/strikes";
import type { Direction } from "@/lib/trade/thesis";
import type { StrikeOption } from "@/lib/trade/strikes";
import type { StrikeTone } from "./strike-box-chart";
import { StrikeBoxesChart } from "./strike-box-chart";

const CONTAINER = "mx-auto w-full max-w-[900px] pb-20 pt-12 max-xl:px-[71px] max-lg:px-6 max-md:px-3 max-md:pt-6";
const PRICE_SCALE = 1_000_000_000;

/** a price level: the strike with the market side it trades — puts resolve "above", calls "below" */
type SideStrike = StrikeOption & { direction: Direction; tone: StrikeTone };

type ExpirySides = { expiryTs: number; putPda: string | null; callPda: string | null };

/** /trade2: a page to experiment with trade UIs. Experiment 1: pick a strike by tapping its square on the chart. */
export function Trade2Client() {
  const { earnSummary } = useRfqContext();
  const assets = useMemo(() => tradeAssets(earnSummary), [earnSummary]);
  const [assetChoice, setAssetChoice] = useState<string | null>(null);
  const [expiryChoice, setExpiryChoice] = useState<number | null>(null);
  const [strikeChoice, setStrikeChoice] = useState<number | null>(null);

  const asset = pickAsset(assets, assetChoice);
  const snapshot = useTokenMarketsSnapshot(asset?.mint ?? null);
  const spot = spotFromSnapshot(snapshot);
  const nowSec = Math.floor(Date.now() / 1000);

  const expiries = useMemo<ExpirySides[]>(() => {
    const byTs = new Map<number, ExpirySides>();
    for (const e of tradableExpiries(snapshot, true, "cash_secured_put", "sell", nowSec)) {
      byTs.set(e.expiryTs, { expiryTs: e.expiryTs, putPda: e.pda, callPda: null });
    }
    for (const e of tradableExpiries(snapshot, false, "covered_call", "sell", nowSec)) {
      const cur = byTs.get(e.expiryTs);
      if (cur) cur.callPda = e.pda;
      else byTs.set(e.expiryTs, { expiryTs: e.expiryTs, putPda: null, callPda: e.pda });
    }
    return [...byTs.values()].sort((a, b) => a.expiryTs - b.expiryTs);
  }, [snapshot, nowSec]);
  const expiry = expiries.find((e) => e.expiryTs === expiryChoice) ?? expiries[0] ?? null;

  const strikeOptions = useMemo<SideStrike[]>(() => {
    if (!expiry) return [];
    const sides = [
      { pda: expiry.putPda, positionType: "cash_secured_put", isPut: true, direction: "above" as Direction, tone: "red" as StrikeTone },
      { pda: expiry.callPda, positionType: "covered_call", isPut: false, direction: "below" as Direction, tone: "green" as StrikeTone },
    ];
    const merged: SideStrike[] = [];
    const seen = new Set<number>();
    for (const side of sides) {
      const options = side.pda
        ? buildStrikeOptions(indicativesFor(snapshot, side.pda, side.positionType, "sell"), {
            referencePrice1e9: snapshot ? Number(snapshot.reference_price) : null,
            secondsToExpiry: expiry.expiryTs - nowSec,
            isPut: side.isPut,
          })
        : [];
      for (const o of options) {
        if (seen.has(o.strike1e9)) continue;
        seen.add(o.strike1e9);
        merged.push({ ...o, direction: side.direction, tone: side.tone });
      }
    }
    return merged;
  }, [snapshot, expiry, nowSec]);

  const defaultOption = useMemo(() => {
    const puts = strikeOptions.filter((o) => o.direction === "above");
    const putIdx = defaultStrikeIndex(puts, spot, true);
    if (putIdx >= 0) return puts[putIdx];
    const calls = strikeOptions.filter((o) => o.direction === "below");
    const callIdx = defaultStrikeIndex(calls, spot, false);
    return callIdx >= 0 ? calls[callIdx] : null;
  }, [strikeOptions, spot]);

  const selected = strikeChoice != null && strikeOptions.some((o) => o.strike1e9 === strikeChoice)
    ? strikeChoice
    : defaultOption?.strike1e9 ?? null;
  const selectedOption = strikeOptions.find((o) => o.strike1e9 === selected) ?? null;

  function chooseAsset(next: string) {
    setAssetChoice(next);
    setExpiryChoice(null);
    setStrikeChoice(null);
  }

  if (!earnSummary || !asset || !snapshot) {
    return (
      <div className={CONTAINER}>
        <div className="mt-8 h-[420px] animate-pulse border border-bg-border bg-action-primary/40 max-md:mt-6" aria-hidden="true" />
      </div>
    );
  }

  const distancePct = selectedOption && spot != null && spot > 0 ? ((selectedOption.strike - spot) / spot) * 100 : null;

  return (
    <div className={CONTAINER}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-lg text-content-primary">Trade 2</h1>
        <span className="font-mono text-xs text-content-secondary">experiment</span>
      </div>

      <AppCard className="mt-6 p-4 max-md:p-3">
        <div className="flex flex-wrap items-center gap-3 font-mono text-sm">
          <label className="flex items-center gap-2 text-content-secondary">
            Asset
            <select
              aria-label="Asset"
              value={asset.symbol}
              onChange={(e) => chooseAsset(e.target.value)}
              className="border border-bg-border bg-bg-primary px-2 py-1 font-mono text-content-primary"
            >
              {assets.map((a) => (
                <option key={a.mint} value={a.symbol}>
                  {a.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-content-secondary">
            Expiry
            <select
              aria-label="Expiry"
              value={expiry ? String(expiry.expiryTs) : ""}
              onChange={(e) => {
                setExpiryChoice(Number(e.target.value));
                setStrikeChoice(null);
              }}
              className="border border-bg-border bg-bg-primary px-2 py-1 font-mono text-content-primary"
            >
              {expiries.map((e) => (
                <option key={e.expiryTs} value={String(e.expiryTs)}>
                  {formatExpiryDay(e.expiryTs * 1000)} · in {formatCountdown(e.expiryTs * 1000, Date.now())}
                </option>
              ))}
            </select>
          </label>
          <span className="ml-auto text-content-primary">
            {asset.symbol} {spot != null ? formatUsdSmart(spot) : "…"}
          </span>
        </div>

        <p className="sr-only">
          {`Pick a strike by tapping its square on the chart. ${asset.symbol} is ${spot != null ? formatUsdSmart(spot) : "loading"} now.`}
        </p>

        <div className="mt-4">
          {spot != null && expiry ? (
            <StrikeBoxesChart
              symbol={asset.symbol}
              spot={spot}
              expiryMs={expiry.expiryTs * 1000}
              strikeOptions={strikeOptions}
              selected1e9={selected}
              onSelect={setStrikeChoice}
            />
          ) : null}
        </div>
      </AppCard>

      {selectedOption && expiry ? (
        <AppCard className="mt-5 p-4 max-md:p-3">
          <div className="grid grid-cols-2 gap-3 font-mono text-sm max-md:grid-cols-2">
            <div>
              <div className="text-content-secondary">Strike</div>
              <div className="text-content-primary">
                {formatStrikePrice(selectedOption.strike)}
                {distancePct != null ? ` · ${Math.abs(distancePct).toFixed(1)}% ${distancePct < 0 ? "below" : "above"} spot` : ""}
              </div>
            </div>
            <div>
              <div className="text-content-secondary">Expiry</div>
              <div className="text-content-primary">{formatExpiryUtc(expiry.expiryTs * 1000)}</div>
            </div>
            <div>
              <div className="text-content-secondary">Indicative premium</div>
              <div className="text-content-primary">
                {selectedOption.bestPrice != null
                  ? `≈ ${formatUsdSmart(selectedOption.bestPrice / PRICE_SCALE)} per ${asset.symbol}`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-content-secondary">APR</div>
              <div className="text-content-primary">
                {selectedOption.apr != null ? formatPct(selectedOption.apr * 100) : "—"}
              </div>
            </div>
          </div>
        </AppCard>
      ) : null}
    </div>
  );
}
