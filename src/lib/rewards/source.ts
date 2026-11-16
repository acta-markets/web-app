import type { Season, SeasonBoard, SeasonBoardQuery, SeasonSubjectResult } from "@acta-markets/ts-sdk/http";
import { isSampleModeEnabled } from "@/lib/vaults/sample";
import { fetchCurrentSeason, fetchSeasonAwards, fetchSeasonBoard, fetchSeasonSubject, type WalletAwards } from "./api";

/**
 * The only place live and sample data split. Hooks read through here; `api.ts` stays a plain
 * HTTP client.
 *
 * Sample mode exists because the backend has no season published yet. It is for development
 * only: `NEXT_PUBLIC_REWARDS_SAMPLE=1`, or `?sample=1` on the page, and never in a production
 * build. The page says "Sample data" whenever it is on.
 */

const SAMPLE_LATENCY_MS = 250;
const now = () => Math.floor(Date.now() / 1000);

/** Sample mode as asked for by the environment or the page's address. Always false in production. */
export function rewardsSampleRequested(nodeEnv: string | undefined, flag: string | undefined, search: string): boolean {
  if (nodeEnv === "production") return false;
  return isSampleModeEnabled(nodeEnv, flag) || new URLSearchParams(search).get("sample") === "1";
}

/** Read in the browser, after the first paint: the server does not know the address's query. */
export function isRewardsSample(): boolean {
  // literal reads so Next inlines both
  return rewardsSampleRequested(process.env.NODE_ENV, process.env.NEXT_PUBLIC_REWARDS_SAMPLE, typeof window === "undefined" ? "" : window.location.search);
}

function later<T>(value: T, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(value), SAMPLE_LATENCY_MS);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });
}

// loaded on demand, so the fixture is not part of the page's own bundle
const sample = () => import("./sample-season");

export async function loadSeason(useSample: boolean, signal?: AbortSignal): Promise<Season | null> {
  if (!useSample) return fetchCurrentSeason(signal);
  return later((await sample()).sampleSeason(now()), signal);
}

export async function loadBoard(
  useSample: boolean,
  slug: string,
  query: SeasonBoardQuery,
  wallet: string | null,
  signal?: AbortSignal,
): Promise<SeasonBoard> {
  if (!useSample) return fetchSeasonBoard(slug, query, signal);
  const data = await sample();
  return later(data.sampleBoard(data.sampleSeason(now()), query, wallet, now()), signal);
}

export async function loadSubject(useSample: boolean, slug: string, wallet: string, signal?: AbortSignal): Promise<SeasonSubjectResult | null> {
  if (!useSample) return fetchSeasonSubject(slug, wallet, signal);
  return later((await sample()).sampleSubject(wallet), signal);
}

export async function loadAwards(useSample: boolean, slug: string, wallet: string, signal?: AbortSignal): Promise<WalletAwards> {
  if (!useSample) return fetchSeasonAwards(slug, wallet, signal);
  return later((await sample()).sampleAwards(now()), signal);
}
