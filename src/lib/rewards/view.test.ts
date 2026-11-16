import { describe, expect, it } from "vitest";
import type { SeasonAward, SeasonBoard, SeasonLeague } from "@acta-markets/ts-sdk/http";
import { SAMPLE_TRADER, sampleAwards, sampleBoard, sampleSeason, sampleSubject } from "./sample-season";
import {
  awardLines,
  boardHasMore,
  boardRows,
  boardStatus,
  clanRows,
  defaultLeagueId,
  hiddenRulesText,
  humanize,
  leagueStandingText,
  leagueView,
  limitText,
  ruleGroups,
  seasonLeagues,
  seasonStandings,
  standingFor,
} from "./view";

const NOW = 1_800_000_000;
const devnet = { mainnet: false };
const season = sampleSeason(NOW);
const league = (id: number) => season.leagues.find((l) => l.id === id) as SeasonLeague;
const awards = sampleAwards(NOW).awards;

describe("a league as the page shows it", () => {
  it("says how long a live league has left, and when it expires in UTC", () => {
    const view = leagueView(league(2), NOW, devnet);
    expect(view.phaseLabel).toBe("Live");
    expect(view.timeText).toMatch(/ left$/);
    expect(view.expiryText).toMatch(/08:00 UTC$/);
    expect(view.live).toBe(true);
  });

  it("says when an upcoming league opens", () => {
    expect(leagueView(league(4), NOW, devnet)).toMatchObject({ phaseLabel: "Opens soon", timeText: "Opens in 2d", live: false, open: true });
  });

  it("counts the positions a settling league still waits for", () => {
    const settling = { ...league(2), phase: { kind: "settling" as const, pending: 3 } };
    expect(leagueView(settling, NOW, devnet)).toMatchObject({ phaseLabel: "Settling", timeText: "3 positions left to settle" });
    expect(leagueView({ ...settling, phase: { kind: "settling", pending: 1 } }, NOW, devnet).timeText).toBe("1 position left to settle");
  });

  it("calls a finalized league Final and takes it out of the open ones", () => {
    expect(leagueView(league(1), NOW, devnet)).toMatchObject({ phaseLabel: "Final", open: false });
  });

  it("never lets a devnet drop read as dollars", () => {
    expect(leagueView(league(2), NOW, devnet).dropText).toBe("$10,000 test funds");
    expect(leagueView(league(2), NOW, { mainnet: true }).dropText).toBe("$10,000");
    expect(leagueView({ ...league(2), drop_usd: 0 }, NOW, devnet).dropText).toBeNull();
  });

  it("lists open leagues by expiry, finished ones newest first, and no drafts", () => {
    const withDraft = { ...season, leagues: [...season.leagues, { ...league(4), id: 9, phase: { kind: "draft" as const } }] };
    const { open, past } = seasonLeagues(withDraft, NOW, devnet);
    expect(open.map((l) => l.id)).toEqual([2, 3, 4]);
    expect(past.map((l) => l.id)).toEqual([1]);
  });

  it("opens on the live league that ends first, else the next, else the last finished", () => {
    const all = seasonLeagues(season, NOW, devnet);
    expect(defaultLeagueId(all)).toBe(2);
    expect(defaultLeagueId({ open: all.open.filter((l) => !l.live), past: all.past })).toBe(4);
    expect(defaultLeagueId({ open: [], past: all.past })).toBe(1);
    expect(defaultLeagueId({ open: [], past: [] })).toBeNull();
  });
});

describe("the rules checklist", () => {
  const groups = ruleGroups(league(2), awards);
  const row = (key: string) => groups.flatMap((g) => g.rows).find((r) => r.key === key)!;

  it("groups rules as the backend groups them, and ungrouped ones under their currency", () => {
    expect(groups.map((g) => g.title)).toEqual(["Base", "Combos", "Nice list"]);
  });

  it("shows a figure only when the points are a plain number", () => {
    expect(row("active_day").pointsText).toBe("+5");
    expect(row("pnl_band").pointsText).toBe("Varies");
    expect(row("tims_call").pointsText).toBe("Varies");
  });

  it("says how often each rule can be earned", () => {
    expect(limitText({ kind: "per_league", n: 1 })).toBe("Once per league");
    expect(limitText({ kind: "per_league", n: 5 })).toBe("Up to 5 per league");
    expect(limitText({ kind: "per_day", n: 1 })).toBe("Once a day");
    expect(limitText({ kind: "per_day", n: 3 })).toBe("Up to 3 a day");
    expect(limitText({ kind: "once_ever" })).toBe("Once ever");
    expect(limitText({ kind: "unlimited" })).toBe("No limit");
  });

  it("counts what the wallet earned in this league", () => {
    expect(row("active_day")).toMatchObject({ earnedTimes: 3, earnedPoints: 15, done: false, progressText: "3 of 5" });
    expect(row("both_sides")).toMatchObject({ earnedTimes: 1, done: true, progressText: "Earned" });
    expect(row("long_strangle")).toMatchObject({ earnedTimes: 0, done: false, progressText: null });
    expect(row("bug_hunter")).toMatchObject({ earnedTimes: 1, done: false, progressText: "Earned 1 time" });
  });

  it("counts a once-ever rule wherever it was earned", () => {
    // first_blood was earned in league 1; it is ticked in league 2 as well
    expect(row("first_blood")).toMatchObject({ earnedTimes: 1, done: true });
    expect(ruleGroups(league(2), []).flatMap((g) => g.rows).find((r) => r.key === "first_blood")?.done).toBe(false);
  });

  it("does not count another league's awards toward a per-league rule", () => {
    const inThree = ruleGroups(league(3), awards).flatMap((g) => g.rows).find((r) => r.key === "active_day");
    expect(inThree).toMatchObject({ earnedTimes: 1, progressText: "1 of 5" });
  });

  it("states a group's budget from its cap, and never more earned than the cap", () => {
    const combos = groups.find((g) => g.title === "Combos")!;
    expect(combos.budget).toEqual({ earned: 30, max: 30 });
    expect(groups.find((g) => g.title === "Base")!.budget).toBeNull();
  });

  it("leaves a cap written as a formula unstated", () => {
    const formula = { ...league(2), transforms: [{ kind: "cap" as const, key: "c", role: "taker" as const, target: { kind: "group" as const, name: "combos" }, max: "drop * 0.003" }] };
    expect(ruleGroups(formula, awards).find((g) => g.title === "Combos")!.budget).toBeNull();
  });

  it("tags combos, cross-league combos and revealed secrets", () => {
    expect(row("long_straddle").tags).toEqual(["Combo"]);
    expect(row("calendar_spread").tags).toEqual(["Combo", "Across leagues"]);
    expect(row("full_send").tags).toEqual(["Secret"]);
    expect(row("active_day").tags).toEqual([]);
  });

  it("leaves out disabled rules and other roles' rules", () => {
    const changed = {
      ...league(2),
      rules: league(2).rules.map((r) => (r.key === "active_day" ? { ...r, enabled: false } : r.key === "both_sides" ? { ...r, role: "maker" as const } : r)),
    };
    const keys = ruleGroups(changed, []).flatMap((g) => g.rows.map((r) => r.key));
    expect(keys).not.toContain("active_day");
    expect(keys).not.toContain("both_sides");
    expect(keys).toContain("pnl_band");
  });

  it("uses the backend's own words for a rule", () => {
    const rule = league(2).rules.find((r) => r.key === "long_straddle")!;
    expect(row("long_straddle")).toMatchObject({ title: rule.title, description: rule.description });
  });

  it("says how many rules are still hidden", () => {
    expect(hiddenRulesText(league(2))).toBe("2 hidden rules. Each shows here once someone earns it.");
    expect(hiddenRulesText({ ...league(2), hidden_rules: 1 })).toBe("1 hidden rule. It shows here once someone earns it.");
    expect(hiddenRulesText({ ...league(2), hidden_rules: 0 })).toBeNull();
  });

  it("reads an identifier as a heading", () => {
    expect(humanize("nice_list")).toBe("Nice list");
    expect(humanize("combos")).toBe("Combos");
  });
});

describe("a board", () => {
  const query = { scope: "league:2" as const, role: "taker" as const, currency: "trading", after_rank: 0, limit: 25 };
  const board = sampleBoard(season, query, SAMPLE_TRADER, NOW);

  it("names a registered trader by name and a bare wallet by its ends", () => {
    const rows = boardRows(board, null);
    expect(rows[0]).toMatchObject({ rank: 1, name: "thetagang", wallet: null });
    expect(rows[1].name).toMatch(/^.{4}….{4}$/);
    expect(rows[1].wallet).toHaveLength(44);
  });

  it("marks the connected wallet's own row, and nobody's without a wallet", () => {
    expect(boardRows(board, SAMPLE_TRADER).filter((r) => r.isMe).map((r) => r.rank)).toEqual([9]);
    expect(boardRows(board, null).some((r) => r.isMe)).toBe(false);
  });

  it("marks a registered trader's row when one of their wallets is connected", () => {
    const grouped: SeasonBoard = {
      ...board,
      rows: [{ ...board.rows[0], subjects: [{ kind: "taker", key: "other" }, { kind: "taker", key: "mine" }] }],
    };
    expect(boardRows(grouped, "mine")[0].isMe).toBe(true);
  });

  it("knows when more rows exist", () => {
    expect(boardHasMore(board)).toBe(true);
    expect(boardHasMore({ last_rank: 61, total: 61 })).toBe(false);
  });

  it("says where the figures stand", () => {
    expect(boardStatus(board, NOW)).toBe("Provisional, updated 3m ago");
    expect(boardStatus({ provisional: false, computation: { kind: "computed", at: NOW - 60 } }, NOW)).toBe("Final");
    expect(boardStatus({ provisional: true, computation: { kind: "not_yet" } }, NOW)).toBe("Not counted yet");
    expect(boardStatus({ provisional: true, computation: { kind: "computed", at: NOW - 10 } }, NOW)).toBe("Provisional, updated just now");
  });

  it("lists the clans of one currency by rank and flags the ones not qualified", () => {
    const clans = clanRows(board, "trading");
    expect(clans.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(clans[0]).toMatchObject({ name: "Theta Gang", membersText: "7 of 9 entered", qualified: true });
    expect(clans[5].qualified).toBe(false);
    expect(clanRows(board, "nice_list")).toEqual([]);
  });
});

describe("one trader", () => {
  const subject = sampleSubject(SAMPLE_TRADER);

  it("finds the standing for a scope and currency", () => {
    expect(standingFor(subject, "season", "trading")).toMatchObject({ rank: 12, entrants: 64, points: 134 });
    expect(standingFor(subject, 2, "trading")).toMatchObject({ rank: 9, points: 59 });
    expect(standingFor(subject, 4, "trading")).toBeNull();
    expect(standingFor(null, "season", "trading")).toBeNull();
  });

  it("gives a season total per currency with the backend's three parts", () => {
    const [trading, nice] = seasonStandings(season, subject);
    expect(trading).toMatchObject({ currencyTitle: "Trading points", points: "134", rankText: "12 of 64" });
    expect(trading.parts.map((p) => [p.label, p.value])).toEqual([
      ["Activity", "135"],
      ["Referral", "4"],
      ["Adjustments", "-5"],
    ]);
    expect(nice).toMatchObject({ currencyTitle: "Nice list", points: "35", rankText: "6 of 18" });
  });

  it("shows zeros and no rank for a wallet the season has not seen", () => {
    expect(seasonStandings(season, null)[0]).toMatchObject({ points: "0", rankText: null });
  });

  it("puts the trader's points and rank on a league's card", () => {
    expect(leagueStandingText(subject, 2, "trading")).toBe("59 pts, rank 9");
    expect(leagueStandingText(subject, 4, "trading")).toBeNull();
  });

  it("names an award by its rule, and a transform by what it does", () => {
    const lines = awardLines(awards, season);
    expect(lines).toHaveLength(awards.length);
    expect(lines[0]).toMatchObject({ title: "Active day", leagueName: league(3).name, points: "+5", negative: false, currencyTitle: "Trading points" });
    expect(lines.find((l) => l.negative)).toMatchObject({ title: "Cap", points: "-5" });
    expect(lines.some((l) => l.title === "Referral share")).toBe(true);
  });

  it("falls back to a readable key for an award whose rule is not in the list", () => {
    const unknown: SeasonAward = { league_id: 2, currency: "trading", source: "rule", key: "midnight_oil", reference: "x", points: 3, awarded_at: NOW };
    expect(awardLines([unknown], season)[0].title).toBe("Midnight oil");
  });
});

describe("the sample season", () => {
  it("adds up: each standing is the sum of that wallet's awards", () => {
    const subject = sampleSubject(SAMPLE_TRADER);
    for (const standing of subject.standings) {
      const mine = awards.filter((a) => a.currency === standing.currency && (standing.scope.kind === "season" || a.league_id === standing.scope.league_id));
      expect(standing.points).toBe(mine.reduce((sum, a) => sum + a.points, 0));
      expect(standing.breakdown.activity + standing.breakdown.referral + standing.breakdown.adjustments).toBe(standing.points);
    }
  });

  it("puts the trader on each board at the rank and points of their standing", () => {
    const subject = sampleSubject(SAMPLE_TRADER);
    const board = sampleBoard(season, { scope: "season", role: "taker", currency: "trading", after_rank: 0, limit: 500 }, SAMPLE_TRADER, NOW);
    const me = boardRows(board, SAMPLE_TRADER).find((r) => r.isMe)!;
    const standing = standingFor(subject, "season", "trading")!;
    expect(me.rank).toBe(standing.rank);
    expect(me.points).toBe(String(standing.points));
    expect(board.rows).toHaveLength(standing.entrants);
    // ranked from the top: points never rise going down
    for (let i = 1; i < board.rows.length; i += 1) expect(board.rows[i].points).toBeLessThanOrEqual(board.rows[i - 1].points);
  });

  it("pages a board by rank", () => {
    const page = sampleBoard(season, { scope: "league:2", role: "taker", currency: "trading", after_rank: 25, limit: 25 }, null, NOW);
    expect(page.rows[0].rank).toBe(26);
    expect(page.last_rank).toBe(50);
  });

  it("has nothing counted for a league that has not opened", () => {
    const board = sampleBoard(season, { scope: "league:4", role: "taker", currency: "trading", after_rank: 0, limit: 25 }, null, NOW);
    expect(board).toMatchObject({ computation: { kind: "not_yet" }, rows: [] });
  });
});
