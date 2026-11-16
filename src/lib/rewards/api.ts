import { ActaHttpClient, ActaHttpError } from "@acta-markets/ts-sdk/http";
import type {
  Season,
  SeasonAward,
  SeasonAwardsPage,
  SeasonBoard,
  SeasonBoardQuery,
  SeasonSubjectResult,
} from "@acta-markets/ts-sdk/http";
import { getApiBaseUrl } from "@/lib/vaults/api";

/**
 * The backend's seasons API: read-only, no sign-in. A season holds leagues; each league has
 * rules, point currencies and boards. The backend the calls go to is the one the vault API
 * uses, so the devnet branch's override decides it here too.
 */

export type { Season, SeasonAward, SeasonAwardsPage, SeasonBoard, SeasonBoardQuery, SeasonSubjectResult };

let httpClient: ActaHttpClient | null = null;
const client = () => (httpClient ??= new ActaHttpClient({ baseUrl: getApiBaseUrl() }));

/** "Nothing there" is an answer, not a failure: no season published, or a wallet with no points. */
export async function nullWhenMissing<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (err) {
    if (err instanceof ActaHttpError && err.status === 404) return null;
    throw err;
  }
}

/** The season shown now, or null while none is published. */
export const fetchCurrentSeason = (signal?: AbortSignal) => nullWhenMissing(client().currentSeason(signal));

export const fetchSeasonBoard = (slug: string, query: SeasonBoardQuery, signal?: AbortSignal) =>
  client().seasonBoard(slug, query, signal);

/** One trader's ranks and where the points came from, or null for a wallet the season has not seen. */
export const fetchSeasonSubject = (slug: string, wallet: string, signal?: AbortSignal) =>
  nullWhenMissing(client().seasonSubject(slug, { kind: "taker", key: wallet }, signal));

export const AWARDS_PAGE_LIMIT = 100;
/** A wallet's awards are read whole, to tick the rules off; this many pages is the most that is read. */
export const AWARDS_MAX_PAGES = 5;

export type WalletAwards = {
  /** Newest first. */
  awards: SeasonAward[];
  /** Older awards exist beyond the pages read, so counts built from these may be short. */
  truncated: boolean;
};

export const NO_AWARDS: WalletAwards = { awards: [], truncated: false };

/** Every award of one trader in a season, newest first, down to `AWARDS_MAX_PAGES` pages. */
export async function fetchSeasonAwards(slug: string, wallet: string, signal?: AbortSignal): Promise<WalletAwards> {
  const awards: SeasonAward[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < AWARDS_MAX_PAGES; page += 1) {
    const next: SeasonAwardsPage | null = await nullWhenMissing(
      client().seasonAwards(slug, { kind: "taker", key: wallet }, { limit: AWARDS_PAGE_LIMIT, ...(cursor ? { cursor } : {}) }, signal),
    );
    if (!next) break;
    awards.push(...next.awards);
    cursor = next.next_cursor;
    if (!cursor) return { awards, truncated: false };
  }
  return { awards, truncated: cursor !== null };
}
