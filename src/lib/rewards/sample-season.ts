import type {
  Season,
  SeasonAward,
  SeasonBoard,
  SeasonBoardQuery,
  SeasonBoardRow,
  SeasonClanRow,
  SeasonConstraint,
  SeasonLeague,
  SeasonLimit,
  SeasonMatch,
  SeasonRule,
  SeasonStanding,
  SeasonSubjectResult,
  SeasonTransform,
} from "@acta-markets/ts-sdk/http";
import type { WalletAwards } from "./api";

/**
 * A made-up season for building and reviewing the Rewards page while the backend has none
 * published. The rules are the ones in the leagues draft (14 Nov 2026), written in the shape
 * the backend serves. Every figure here is invented: the page marks this mode "Sample data",
 * and it never runs in a production build.
 */

const DAY = 86_400;
const HOUR = 3_600;
const TRADING = "trading";
const NICE = "nice_list";
/** Stands in for the trader when no wallet is connected. */
export const SAMPLE_TRADER = "Samp1eTraderWa11etAddressForTheRewardsPage11";

const perLeague = (n = 1): SeasonLimit => ({ kind: "per_league", n });
const UNLIMITED: SeasonLimit = { kind: "unlimited" };

const each = (stream: "trades" | "settles" | "admin" | "marks" | "legs", when: string): SeasonMatch => ({
  kind: "each",
  leg: { var: "e", stream, when },
});

const SAME_EXPIRY: SeasonConstraint[] = [
  { kind: "same", fields: ["underlying", "expiry"] },
  { kind: "size_ratio", min: 0.8, max: 1.25 },
];

function combo(legs: string[], extra: SeasonConstraint[] = [], across = false): SeasonMatch {
  return {
    kind: "combo",
    legs: legs.map((when, i) => ({ var: String.fromCharCode(97 + i), stream: "trades", when })),
    constraints: [...(across ? [] : SAME_EXPIRY), ...extra],
    across_leagues: across,
  };
}

type RuleSpec = [key: string, title: string, description: string, points: string, limit: SeasonLimit, match: SeasonMatch];

function rules(specs: RuleSpec[], currency: string, group: string | null, secret: readonly string[] = []): SeasonRule[] {
  return specs.map(([key, title, description, points, limit, match]) => ({
    key,
    title,
    description,
    role: "taker",
    currency,
    enabled: true,
    visibility: secret.includes(key) ? "secret" : "public",
    match,
    points,
    limit,
    group: group ? { kind: "named", name: group } : { kind: "none" },
  }));
}

const BUY_CALL = 'e.action == "open" && e.side == "buy" && e.option_type == "call"';
const BUY_PUT = 'e.action == "open" && e.side == "buy" && e.option_type == "put"';
const SELL_CALL = 'e.action == "open" && e.side == "sell" && e.option_type == "call"';
const SELL_PUT = 'e.action == "open" && e.side == "sell" && e.option_type == "put"';
const strikes = (expr: string): SeasonConstraint[] => [{ kind: "expr", expr }];

const BASE: RuleSpec[] = [
  ["active_day", "Active day", "A qualifying trade on a UTC day. The first five days of a league count.", "5", perLeague(5), each("marks", 'e.kind == "day_active"')],
  [
    "pnl_band",
    "P&L band",
    "Finish the league in profit: 50 for the top 10%, 35 for the top 25%, 20 for the top half, 10 for any profit.",
    'e.band == "top10" ? 50 : e.band == "top25" ? 35 : e.band == "top50" ? 20 : 10',
    perLeague(),
    { kind: "subject", when: "result.pnl > 0" },
  ],
  ["both_sides", "Both sides", "At least one buy and one sell in the league.", "10", perLeague(), combo(['e.side == "buy"', 'e.side == "sell"'])],
];

const COMBOS: RuleSpec[] = [
  ["long_straddle", "Long straddle", "Buy a call and a put at the same strike and expiry.", "10", perLeague(), combo([BUY_CALL, BUY_PUT], strikes("a.strike == b.strike"))],
  ["long_strangle", "Long strangle", "Buy a call and a put, the put struck below the call.", "10", perLeague(), combo([BUY_CALL, BUY_PUT], strikes("b.strike < a.strike"))],
  ["bull_call_spread", "Bull call spread", "Buy a call and sell a call at a higher strike.", "10", perLeague(), combo([BUY_CALL, SELL_CALL], strikes("a.strike < b.strike"))],
  ["bear_put_spread", "Bear put spread", "Buy a put and sell a put at a lower strike.", "10", perLeague(), combo([BUY_PUT, SELL_PUT], strikes("a.strike > b.strike"))],
  ["bull_put_spread", "Bull put spread", "Sell a put and buy a put at a lower strike.", "10", perLeague(), combo([SELL_PUT, BUY_PUT], strikes("a.strike > b.strike"))],
  ["bear_call_spread", "Bear call spread", "Sell a call and buy a call at a higher strike.", "10", perLeague(), combo([SELL_CALL, BUY_CALL], strikes("a.strike < b.strike"))],
  ["short_strangle", "Short strangle", "Sell a call and a put, the put struck below the call.", "10", perLeague(), combo([SELL_CALL, SELL_PUT], strikes("b.strike < a.strike"))],
  ["risk_reversal", "Risk reversal", "Sell a put and buy a call at a higher strike.", "10", perLeague(), combo([SELL_PUT, BUY_CALL], strikes("a.strike < b.strike"))],
  ["iron_condor", "Iron condor", "Sell a put and a call, and buy a put below and a call above them. Four strikes in order.", "20", perLeague(), combo([SELL_PUT, BUY_PUT, SELL_CALL, BUY_CALL], strikes("b.strike < a.strike && a.strike < c.strike && c.strike < d.strike"))],
  ["butterfly", "Butterfly", "Buy one low, sell two in the middle and buy one high, all calls or all puts, evenly spaced.", "20", perLeague(), combo(['e.side == "buy"', 'e.side == "sell"', 'e.side == "buy"'], strikes("b.strike - a.strike == c.strike - b.strike"))],
  ["cash_secured_put", "Cash secured put", "Sell a put and hold it to settlement.", "5", perLeague(), each("settles", 'e.direction == "short" && e.option_type == "put"')],
  ["covered_call", "Covered call", "Sell a call against the asset and hold it to settlement.", "5", perLeague(), each("settles", 'e.direction == "short" && e.option_type == "call"')],
  ["calendar_spread", "Calendar spread", "Sell the near expiry and buy the far one, same type and strike.", "15", perLeague(), combo(['e.side == "sell"', 'e.side == "buy"'], [{ kind: "same", fields: ["underlying", "option_type", "strike"] }, { kind: "different", fields: ["expiry"] }], true)],
  ["roll_forward", "Roll forward", "Close in one league and open the same side in a later one within 30 minutes.", "5", perLeague(), combo(['e.action == "close"', 'e.action == "open"'], [{ kind: "within_minutes", minutes: 30 }, { kind: "different", fields: ["expiry"] }], true)],
  ["hat_trick", "Hat trick", "A qualifying trade in every open league.", "10", perLeague(), each("marks", 'e.kind == "all_open_entered"')],
  ["first_blood", "First blood", "Your first trade ever.", "5", { kind: "once_ever" }, each("trades", "e.is_first_ever")],
  ["both_types", "Both types", "At least one call and one put in the league.", "5", perLeague(), combo(['e.option_type == "call"', 'e.option_type == "put"'])],
  ["round_trip", "Round trip", "Open a position and close it after holding for at least an hour.", "5", perLeague(), each("legs", "e.closed && e.held_minutes >= 60")],
  ["to_the_bell", "To the bell", "Hold to settlement a position opened at least 48 hours before expiry.", "5", perLeague(), each("settles", "e.opened_hours_before >= 48")],
  ["in_the_money", "In the money", "A bought option settles in the money.", "5", perLeague(), each("settles", 'e.direction == "long" && e.outcome == "itm"')],
  ["premium_kept", "Premium kept", "A sold option settles out of the money.", "5", perLeague(), each("settles", 'e.direction == "short" && e.outcome == "otm"')],
  ["comeback", "Comeback", "Negative at the league's midpoint, positive at the end.", "10", perLeague(), { kind: "subject", when: "result.mid_pnl < 0 && result.pnl > 0" }],
  ["full_send", "Full send", "Use the whole of a league's cap.", "5", perLeague(), each("marks", 'e.kind == "cap_reached"')],
  ["perfect_week", "Perfect week", "Five active days in one league.", "5", perLeague(), each("marks", 'e.kind == "day_active" && e.day_index == 5')],
];

const COMMUNITY: RuleSpec[] = [
  ["recruiter", "Recruiter", "A trader you invited reaches two active days.", "10", perLeague(5), each("admin", 'e.kind == "referral_activated"')],
  ["bug_hunter", "Bug hunter", "A bug you reported is confirmed: 10, 30, 75 or 200 by severity.", 'e.severity == "critical" ? 200 : e.severity == "high" ? 75 : e.severity == "medium" ? 30 : 10', UNLIMITED, each("admin", 'e.kind == "bug_confirmed"')],
  ["shipped_it", "Shipped it", "A change you suggested goes live.", "50", UNLIMITED, each("admin", 'e.kind == "idea_shipped"')],
  ["scribe", "Scribe", "A trade write-up or guide you published, approved by the team.", "20", perLeague(), each("admin", 'e.kind == "writeup_published"')],
  ["show_off", "Show off", "Share a P&L or league card on X.", "5", perLeague(), each("admin", 'e.kind == "card_posted"')],
  ["tims_call", "Tim's call", "Awarded by hand, with a public note.", "e.points", UNLIMITED, each("admin", 'e.kind == "nice_list_awarded"')],
];

const TRANSFORMS: SeasonTransform[] = [
  { kind: "cap", key: "combo_budget", role: "taker", target: { kind: "group", name: "combos" }, max: "30" },
  { kind: "referral_share", key: "clan_share", from: TRADING, to: TRADING, levels: [1000, 500], referee_bps: 0 },
];

function leagueName(expiry: number): string {
  return `SOL ${new Date(expiry * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

function league(id: number, listedAt: number, expiry: number, phase: SeasonLeague["phase"], nowSecs: number): SeasonLeague {
  const counted = phase.kind !== "upcoming" && phase.kind !== "draft";
  return {
    id,
    name: leagueName(expiry),
    description: "One week on SOL options. One drop of capital, one board.",
    listed_at: listedAt,
    expiry,
    midpoint: Math.floor((listedAt + expiry) / 2),
    drop_usd: 10_000,
    weight: 1,
    phase,
    ruleset_revision: 3,
    computation: counted ? { kind: "computed", at: phase.kind === "finalized" ? expiry + 2 * HOUR : nowSecs - 3 * 60 } : { kind: "not_yet" },
    currencies: [
      { id: TRADING, title: "Trading points" },
      { id: NICE, title: "Nice list" },
    ],
    rules: [...rules(BASE, TRADING, "base"), ...rules(COMBOS, TRADING, "combos", ["full_send"]), ...rules(COMMUNITY, NICE, null)],
    hidden_rules: 2,
    transforms: TRANSFORMS,
  };
}

export type SampleSeasonOptions = {
  /** Put the nearest league in another phase, for reviewing that state. */
  nearest?: SeasonLeague["phase"];
};

/** Four leagues a week apart: one finished, two live (the nearer past its midpoint), one opening. */
export function sampleSeason(nowSecs: number, { nearest }: SampleSeasonOptions = {}): Season {
  const next = Math.floor(nowSecs / DAY) * DAY + 8 * HOUR + 2 * DAY;
  return {
    slug: "sample",
    name: "Devnet leagues",
    description: "Trade each week's expiry on devnet. Points decide the board.",
    leagues: [
      league(1, next - 14 * DAY, next - 7 * DAY, { kind: "finalized" }, nowSecs),
      league(2, next - 7 * DAY, next, nearest ?? { kind: "live" }, nowSecs),
      league(3, nowSecs - DAY, next + 7 * DAY, { kind: "live" }, nowSecs),
      league(4, nowSecs + 2 * DAY, next + 14 * DAY, { kind: "upcoming" }, nowSecs),
    ],
  };
}

// ---------------------------------------------------------------------------------------
// One trader's awards, and the standings they add up to
// ---------------------------------------------------------------------------------------

type AwardSpec = [league: number, currency: string, source: "rule" | "transform", key: string, points: number, hoursAgo: number];

const AWARDS: AwardSpec[] = [
  [3, TRADING, "rule", "active_day", 5, 2],
  [2, TRADING, "transform", "combo_budget", -5, 5],
  [2, TRADING, "rule", "full_send", 5, 5],
  [2, NICE, "rule", "show_off", 5, 9],
  [2, TRADING, "rule", "active_day", 5, 20],
  [2, TRADING, "rule", "both_types", 5, 21],
  [2, TRADING, "transform", "clan_share", 4, 26],
  [2, TRADING, "rule", "round_trip", 5, 30],
  [2, NICE, "rule", "bug_hunter", 30, 41],
  [2, TRADING, "rule", "bull_call_spread", 10, 44],
  [2, TRADING, "rule", "active_day", 5, 45],
  [2, TRADING, "rule", "long_straddle", 10, 68],
  [2, TRADING, "rule", "both_sides", 10, 69],
  [2, TRADING, "rule", "active_day", 5, 70],
  [1, TRADING, "rule", "pnl_band", 20, 7 * 24 + 60],
  [1, TRADING, "rule", "long_strangle", 10, 9 * 24],
  [1, TRADING, "rule", "active_day", 5, 9 * 24 + 1],
  [1, TRADING, "rule", "active_day", 5, 10 * 24],
  [1, TRADING, "rule", "both_sides", 10, 11 * 24],
  [1, TRADING, "rule", "active_day", 5, 11 * 24 + 2],
  [1, TRADING, "rule", "active_day", 5, 12 * 24],
  [1, TRADING, "rule", "first_blood", 5, 13 * 24],
  [1, TRADING, "rule", "active_day", 5, 13 * 24 + 1],
];

export function sampleAwards(nowSecs: number): WalletAwards {
  const awards: SeasonAward[] = AWARDS.map(([league_id, currency, source, key, points, hoursAgo], i) => ({
    league_id,
    currency,
    source,
    key,
    reference: `sample-${i}`,
    points,
    awarded_at: nowSecs - hoursAgo * HOUR,
  }));
  return { awards, truncated: false };
}

/** Where the sample trader sits on each board, and among how many. */
const RANKS: Record<string, { rank: number; entrants: number }> = {
  [`season:${TRADING}`]: { rank: 12, entrants: 64 },
  [`season:${NICE}`]: { rank: 6, entrants: 18 },
  [`1:${TRADING}`]: { rank: 14, entrants: 52 },
  [`2:${TRADING}`]: { rank: 9, entrants: 61 },
  [`2:${NICE}`]: { rank: 6, entrants: 18 },
  [`3:${TRADING}`]: { rank: 31, entrants: 40 },
};

function standing(scope: "season" | number, currency: string): SeasonStanding | null {
  const place = RANKS[`${scope}:${currency}`];
  if (!place) return null;
  const mine = AWARDS.filter(([league, c]) => c === currency && (scope === "season" || league === scope));
  const sum = (pick: (a: AwardSpec) => boolean) => mine.filter(pick).reduce((total, a) => total + a[4], 0);
  const activity = sum((a) => a[2] === "rule");
  const referral = sum((a) => a[2] === "transform" && a[3] === "clan_share");
  const adjustments = sum((a) => a[2] === "transform" && a[3] !== "clan_share");
  return {
    scope: scope === "season" ? { kind: "season" } : { kind: "league", league_id: scope },
    role: "taker",
    currency,
    rank: place.rank,
    entrants: place.entrants,
    points: activity + referral + adjustments,
    breakdown: { activity, referral, adjustments },
  };
}

export function sampleSubject(wallet: string): SeasonSubjectResult {
  const scopes: Array<"season" | number> = ["season", 1, 2, 3];
  return {
    subject: { kind: "taker", key: wallet },
    name: { kind: "anonymous" },
    standings: scopes.flatMap((scope) => [TRADING, NICE].map((currency) => standing(scope, currency))).filter((s): s is SeasonStanding => s !== null),
  };
}

// ---------------------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------------------

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const NAMES = ["thetagang", "vol_surface", "delta_dan", "gamma_squeeze", "premium_harvest", "wheel_runner", "strangle_hold", "the_writer"];
const CLANS = ["Theta Gang", "Wheel Runners", "Long Vol Society", "Premium Collectors", "Strike Team", "The Covered", "Gamma Rays"];

/** A wallet-shaped string that is the same on every call for the same seed. */
function fakeWallet(seed: number): string {
  let state = (seed * 2654435761) >>> 0;
  let out = "";
  for (let i = 0; i < 44; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out += BASE58[state % BASE58.length];
  }
  return out;
}

function clans(currency: string): SeasonClanRow[] {
  return CLANS.map((name, i) => ({
    currency,
    clan_id: i + 1,
    name,
    members: 9 - i,
    entered: Math.max(1, 7 - i),
    qualified: 9 - i >= 3 && i !== 5,
    points: 640 - i * 83,
    rank: i + 1,
  }));
}

/** One page of a sample board. `wallet` takes the sample trader's place on it. */
export function sampleBoard(season: Season, query: SeasonBoardQuery, wallet: string | null, nowSecs: number): SeasonBoard {
  const scope = query.scope === "season" ? "season" : Number(query.scope.slice("league:".length));
  const target = scope === "season" ? null : season.leagues.find((l) => l.id === scope);
  const place = RANKS[`${scope}:${query.currency}`];
  const mine = standing(scope, query.currency);
  const notCounted = target ? target.computation.kind === "not_yet" : false;
  if (notCounted || !place || !mine) {
    return { provisional: true, computation: notCounted ? { kind: "not_yet" } : { kind: "computed", at: nowSecs - 3 * 60 }, total: 0, last_rank: 0, rows: [], clans: [] };
  }
  const me = wallet ?? SAMPLE_TRADER;
  const seedBase = (scope === "season" ? 0 : scope) * 1000 + (query.currency === TRADING ? 0 : 500);
  const rows: SeasonBoardRow[] = [];
  const limit = Math.min(500, Math.max(1, query.limit));
  for (let rank = query.after_rank + 1; rank <= place.entrants && rows.length < limit; rank += 1) {
    const above = place.rank - rank;
    const points = rank === place.rank ? mine.points : above > 0 ? mine.points + above * 6 + (above % 3) : Math.max(0, mine.points + above * 2);
    const key = rank === place.rank ? me : fakeWallet(seedBase + rank);
    const named = rank !== place.rank && rank % 4 === 1;
    rows.push({
      role: "taker",
      currency: query.currency,
      rank,
      entrant: named ? { kind: "participant", id: rank, display_name: NAMES[(rank >> 2) % NAMES.length] } : { kind: "subject", subject: { kind: "taker", key } },
      points,
      subjects: [{ kind: "taker", key }],
    });
  }
  const final = target?.phase.kind === "finalized";
  return {
    provisional: !final,
    computation: target ? target.computation : { kind: "computed", at: nowSecs - 3 * 60 },
    total: place.entrants,
    last_rank: rows.length ? rows[rows.length - 1].rank : query.after_rank,
    rows,
    clans: clans(query.currency),
  };
}
