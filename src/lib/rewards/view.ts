import type {
  LeaguePhase,
  Season,
  SeasonAward,
  SeasonBoard,
  SeasonLeague,
  SeasonLimit,
  SeasonRole,
  SeasonRule,
  SeasonStanding,
  SeasonSubjectResult,
  SeasonTransform,
} from "@acta-markets/ts-sdk/http";
import { numberFormat } from "@/lib/number-format";
import { formatDate, formatDuration, shortAddress } from "@/lib/vaults/format";

/**
 * What the Rewards page says, worked out from the season as the backend serves it. Pure, so
 * every line on the page can be tested without a network or a wallet.
 *
 * Two rules hold throughout. A rule's title and description are the backend's words, shown
 * as they come. And nothing is computed that the backend did not state: a rule's points are
 * a formula on the wire, so a figure is shown only when that formula is a plain number.
 */

/** The page is the trader's: makers and vaults score on boards of their own. */
export const TRADER: SeasonRole = "taker";

const points = numberFormat({ maximumFractionDigits: 2 });
const usd = numberFormat({ style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatPoints(n: number): string {
  return points.format(n);
}

export function formatSignedPoints(n: number): string {
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${points.format(Math.abs(n))}`;
}

// ---------------------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------------------

export type LeagueView = {
  id: number;
  name: string;
  description: string;
  phase: LeaguePhase["kind"];
  /** "Live", "Opens soon", "Settling", "Results ready", "Final". */
  phaseLabel: string;
  /** Still to be decided: shown among the open leagues, not the past ones. */
  open: boolean;
  /** Points can be earned in it right now. */
  live: boolean;
  /** What the clock says: "2d 4h left", "Opens in 3d", "3 positions left to settle". */
  timeText: string;
  /** When it expires: "Nov 20, 08:00 UTC". */
  expiryText: string;
  /** The balance drop, or null when the league has none. */
  dropText: string | null;
  pastMidpoint: boolean;
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Expiries are instants the whole world shares, so they are said in UTC. */
export function formatUtc(secs: number): string {
  const date = new Date(secs * 1000);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day}, ${time} UTC`;
}

export function leagueView(league: SeasonLeague, nowSecs: number, { mainnet }: { mainnet: boolean }): LeagueView {
  const phase = league.phase;
  const left = league.expiry - nowSecs;
  let phaseLabel: string;
  let timeText: string;
  switch (phase.kind) {
    case "draft":
    case "upcoming":
      phaseLabel = "Opens soon";
      timeText = league.listed_at > nowSecs ? `Opens in ${formatDuration(league.listed_at - nowSecs)}` : "Opening";
      break;
    case "live":
      phaseLabel = "Live";
      timeText = left > 0 ? `${formatDuration(left)} left` : "Closing";
      break;
    case "settling":
      phaseLabel = "Settling";
      timeText = phase.pending > 0 ? `${plural(phase.pending, "position", "positions")} left to settle` : "Counting results";
      break;
    case "ready":
      phaseLabel = "Results ready";
      timeText = "Being checked before they are final";
      break;
    case "finalized":
      phaseLabel = "Final";
      timeText = `Ended ${formatDate(league.expiry)}`;
      break;
  }
  return {
    id: league.id,
    name: league.name,
    description: league.description,
    phase: phase.kind,
    phaseLabel,
    open: phase.kind !== "finalized" && phase.kind !== "draft",
    live: phase.kind === "live",
    timeText,
    expiryText: formatUtc(league.expiry),
    // On devnet the drop is play money, and the figure must never read as dollars.
    dropText: league.drop_usd > 0 ? `${usd.format(league.drop_usd)}${mainnet ? "" : " test funds"}` : null,
    pastMidpoint: nowSecs >= league.midpoint,
  };
}

/** A season's leagues as the page lists them: the open ones in expiry order, then the finished ones, newest first. Drafts are not shown. */
export function seasonLeagues(season: Season, nowSecs: number, env: { mainnet: boolean }): { open: LeagueView[]; past: LeagueView[] } {
  const views = season.leagues.filter((l) => l.phase.kind !== "draft").map((l) => ({ view: leagueView(l, nowSecs, env), expiry: l.expiry }));
  return {
    open: views.filter((v) => v.view.open).sort((a, b) => a.expiry - b.expiry).map((v) => v.view),
    past: views.filter((v) => !v.view.open).sort((a, b) => b.expiry - a.expiry).map((v) => v.view),
  };
}

/** The league the page opens on: the live one that ends first, else the next to open, else the last finished. */
export function defaultLeagueId(leagues: { open: LeagueView[]; past: LeagueView[] }): number | null {
  return (leagues.open.find((l) => l.live) ?? leagues.open[0] ?? leagues.past[0])?.id ?? null;
}

// ---------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------

export type RuleRow = {
  key: string;
  title: string;
  description: string;
  /** "+10", or "Varies" when the points are a formula. */
  pointsText: string;
  /** How often it can be earned: "Once per league". */
  limitText: string;
  /** "Combo", "Across leagues", "Secret". */
  tags: string[];
  earnedTimes: number;
  earnedPoints: number;
  /** Earned as often as it can be. */
  done: boolean;
  /** "2 of 5", "Earned", "Earned 3 times"; null when not earned and there is nothing to count toward. */
  progressText: string | null;
};

export type RuleGroup = {
  id: string;
  title: string;
  /** The currency its rules pay in. */
  currency: string;
  currencyTitle: string;
  /** The cap on the group's points, when the league states one as a plain number. */
  budget: { earned: number; max: number } | null;
  rows: RuleRow[];
};

/** A formula that is only a number, such as "10" or "2.5". */
function plainNumber(expression: string): number | null {
  return /^\s*\d+(\.\d+)?\s*$/.test(expression) ? Number(expression) : null;
}

export function limitText(limit: SeasonLimit): string {
  switch (limit.kind) {
    case "unlimited":
      return "No limit";
    case "once_ever":
      return "Once ever";
    case "per_league":
      return limit.n === 1 ? "Once per league" : `Up to ${limit.n} per league`;
    case "per_day":
      return limit.n === 1 ? "Once a day" : `Up to ${limit.n} a day`;
  }
}

/** An identifier as a heading: "nice_list" reads "Nice list". */
export function humanize(id: string): string {
  const words = id.replace(/[_-]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

function ruleTags(rule: SeasonRule): string[] {
  const tags: string[] = [];
  if (rule.match.kind === "combo") {
    tags.push("Combo");
    if (rule.match.across_leagues) tags.push("Across leagues");
  }
  if (rule.visibility === "secret") tags.push("Secret");
  return tags;
}

function ruleRow(rule: SeasonRule, league: SeasonLeague, awards: readonly SeasonAward[]): RuleRow {
  // "Once ever" is earned wherever it was earned; everything else is counted inside this league.
  const mine = awards.filter(
    (a) => a.source === "rule" && a.key === rule.key && a.currency === rule.currency && (rule.limit.kind === "once_ever" || a.league_id === league.id),
  );
  const earnedTimes = mine.length;
  const earnedPoints = mine.reduce((sum, a) => sum + a.points, 0);
  const fixed = plainNumber(rule.points);
  const max = rule.limit.kind === "per_league" ? rule.limit.n : rule.limit.kind === "once_ever" ? 1 : null;
  const done = max !== null ? earnedTimes >= max : false;
  let progressText: string | null = null;
  if (max !== null && max > 1) progressText = `${Math.min(earnedTimes, max)} of ${max}`;
  else if (earnedTimes > 0) progressText = max === 1 ? "Earned" : `Earned ${plural(earnedTimes, "time", "times")}`;
  return {
    key: rule.key,
    title: rule.title,
    description: rule.description,
    pointsText: fixed !== null ? formatSignedPoints(fixed) : "Varies",
    limitText: limitText(rule.limit),
    tags: ruleTags(rule),
    earnedTimes,
    earnedPoints,
    done,
    progressText,
  };
}

function currencyTitle(league: SeasonLeague, id: string): string {
  return league.currencies.find((c) => c.id === id)?.title ?? humanize(id);
}

function groupCap(league: SeasonLeague, group: string, role: SeasonRole): number | null {
  for (const t of league.transforms) {
    if (t.kind === "cap" && t.role === role && t.target.kind === "group" && t.target.name === group) return plainNumber(t.max);
  }
  return null;
}

/**
 * The league's rules for one role as a checklist, in the backend's order, under the group
 * each belongs to (or its currency when it has none). Disabled rules are left out. A secret
 * rule appears here only once the backend reveals it; `hiddenRules` counts the rest.
 */
export function ruleGroups(league: SeasonLeague, awards: readonly SeasonAward[], role: SeasonRole = TRADER): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const rule of league.rules) {
    if (!rule.enabled || rule.role !== role) continue;
    const named = rule.group.kind === "named" ? rule.group.name : null;
    const id = named ? `group:${named}:${rule.currency}` : `currency:${rule.currency}`;
    let group = groups.get(id);
    if (!group) {
      const title = currencyTitle(league, rule.currency);
      const cap = named ? groupCap(league, named, role) : null;
      group = {
        id,
        title: named ? humanize(named) : title,
        currency: rule.currency,
        currencyTitle: title,
        budget: cap !== null ? { earned: 0, max: cap } : null,
        rows: [],
      };
      groups.set(id, group);
    }
    group.rows.push(ruleRow(rule, league, awards));
  }
  for (const group of groups.values()) {
    if (group.budget) group.budget.earned = Math.min(group.budget.max, group.rows.reduce((sum, r) => sum + r.earnedPoints, 0));
  }
  return [...groups.values()];
}

/** "2 hidden rules. Each shows here once someone earns it." or null. */
export function hiddenRulesText(league: SeasonLeague): string | null {
  if (league.hidden_rules <= 0) return null;
  return league.hidden_rules === 1
    ? "1 hidden rule. It shows here once someone earns it."
    : `${league.hidden_rules} hidden rules. Each shows here once someone earns it.`;
}

// ---------------------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------------------

export type BoardRowView = {
  rank: number;
  /** A registered name, or a shortened wallet. */
  name: string;
  /** The whole wallet, when the row is one wallet, for a title. */
  wallet: string | null;
  points: string;
  isMe: boolean;
};

export function boardRows(board: SeasonBoard, wallet: string | null | undefined): BoardRowView[] {
  return board.rows.map((row) => {
    const own = row.entrant.kind === "subject" ? row.entrant.subject.key : null;
    return {
      rank: row.rank,
      name: row.entrant.kind === "participant" ? row.entrant.display_name : shortAddress(row.entrant.subject.key),
      wallet: own,
      points: formatPoints(row.points),
      isMe: !!wallet && (own === wallet || row.subjects.some((s) => s.key === wallet)),
    };
  });
}

export type ClanRowView = {
  id: number;
  rank: number;
  name: string;
  /** "4 of 6 entered". */
  membersText: string;
  points: string;
  qualified: boolean;
};

export function clanRows(board: SeasonBoard, currency: string): ClanRowView[] {
  return board.clans
    .filter((clan) => clan.currency === currency)
    .sort((a, b) => a.rank - b.rank)
    .map((clan) => ({
      id: clan.clan_id,
      rank: clan.rank,
      name: clan.name,
      membersText: `${clan.entered} of ${clan.members} entered`,
      points: formatPoints(clan.points),
      qualified: clan.qualified,
    }));
}

export function formatAgo(thenSecs: number, nowSecs: number): string {
  const gone = nowSecs - thenSecs;
  return gone < 60 ? "just now" : `${formatDuration(gone)} ago`;
}

/** Where a board's figures stand: counted yet, still moving, or frozen. */
export function boardStatus(board: Pick<SeasonBoard, "provisional" | "computation">, nowSecs: number): string {
  if (board.computation.kind === "not_yet") return "Not counted yet";
  if (!board.provisional) return "Final";
  return `Provisional, updated ${formatAgo(board.computation.at, nowSecs)}`;
}

/** More rows exist past the ones loaded. */
export function boardHasMore(board: Pick<SeasonBoard, "last_rank" | "total">): boolean {
  return board.last_rank < board.total;
}

// ---------------------------------------------------------------------------------------
// One trader
// ---------------------------------------------------------------------------------------

export type StandingScope = "season" | number;

export function standingFor(
  result: SeasonSubjectResult | null,
  scope: StandingScope,
  currency: string,
  role: SeasonRole = TRADER,
): SeasonStanding | null {
  return (
    result?.standings.find(
      (s) =>
        s.role === role &&
        s.currency === currency &&
        (scope === "season" ? s.scope.kind === "season" : s.scope.kind === "league" && s.scope.league_id === scope),
    ) ?? null
  );
}

export type StandingView = {
  currency: string;
  currencyTitle: string;
  points: string;
  /** "12 of 340", or null when the trader has no rank on this board yet. */
  rankText: string | null;
  /** The three parts the backend splits a total into, each as a signed figure. */
  parts: Array<{ label: string; value: string; note: string }>;
};

/** A trader's season totals, one per currency the season counts in. */
export function seasonStandings(season: Season, result: SeasonSubjectResult | null): StandingView[] {
  const currencies = new Map<string, string>();
  for (const league of season.leagues) for (const c of league.currencies) if (!currencies.has(c.id)) currencies.set(c.id, c.title);
  return [...currencies].map(([id, title]) => {
    const standing = standingFor(result, "season", id);
    return {
      currency: id,
      currencyTitle: title,
      points: formatPoints(standing?.points ?? 0),
      rankText: standing && standing.rank > 0 ? `${standing.rank} of ${standing.entrants}` : null,
      parts: [
        { label: "Activity", value: formatPoints(standing?.breakdown.activity ?? 0), note: "From the rules" },
        { label: "Referral", value: formatPoints(standing?.breakdown.referral ?? 0), note: "From traders you invited" },
        { label: "Adjustments", value: formatSignedPoints(standing?.breakdown.adjustments ?? 0), note: "Caps and multipliers" },
      ],
    };
  });
}

/** "42 pts, rank 12" for a league's card; null when the trader has nothing in it. */
export function leagueStandingText(result: SeasonSubjectResult | null, leagueId: number, currency: string): string | null {
  const standing = standingFor(result, leagueId, currency);
  if (!standing || (standing.points === 0 && standing.rank === 0)) return null;
  return standing.rank > 0 ? `${formatPoints(standing.points)} pts, rank ${standing.rank}` : `${formatPoints(standing.points)} pts`;
}

export type AwardLine = {
  id: string;
  title: string;
  leagueName: string;
  currencyTitle: string;
  points: string;
  negative: boolean;
  /** When it was awarded, in seconds. */
  at: number;
};

const TRANSFORM_NAMES: Record<SeasonTransform["kind"], string> = {
  cap: "Cap",
  scale: "Multiplier",
  referral_share: "Referral share",
  pool: "Prize pool",
};

/** A trader's awards as lines, in the order given (the backend sends newest first). */
export function awardLines(awards: readonly SeasonAward[], season: Season): AwardLine[] {
  const leagues = new Map(season.leagues.map((l) => [l.id, l]));
  return awards.map((award, index) => {
    const league = leagues.get(award.league_id);
    let title: string | undefined;
    if (award.source === "rule") title = league?.rules.find((r) => r.key === award.key)?.title;
    else {
      const kind = league?.transforms.find((t) => t.key === award.key)?.kind;
      title = kind ? TRANSFORM_NAMES[kind] : undefined;
    }
    return {
      id: `${award.league_id}:${award.source}:${award.key}:${award.reference}:${award.awarded_at}:${index}`,
      title: title ?? humanize(award.key),
      leagueName: league?.name ?? `League ${award.league_id}`,
      currencyTitle: league ? currencyTitle(league, award.currency) : humanize(award.currency),
      points: formatSignedPoints(award.points),
      negative: award.points < 0,
      at: award.awarded_at,
    };
  });
}
