"use client";

import * as React from "react";
import { AppButton, AppButtonLink } from "@/components/app-ui/app-button";
import { AppCard } from "@/components/app-ui/app-card";
import { AppPill } from "@/components/app-ui/app-pill";
import { Chevron } from "@/components/app-ui/chevron";
import { TYPE_DENSE, TYPE_LABEL, TYPE_NOTE, TYPE_VALUE } from "@/components/app-ui/type-styles";
import { cn } from "@/lib/cn";
import type { AwardLine, BoardRowView, ClanRowView, LeagueView, RuleGroup, RuleRow, StandingView } from "@/lib/rewards/view";
import { formatAgo } from "@/lib/rewards/view";

/**
 * The Rewards page's pieces. Each takes what it shows as props and reads nothing itself, so
 * the page and the review gallery draw the same components.
 */

const LABEL = `${TYPE_LABEL} text-content-tertiary`;
const BONE = "animate-pulse bg-action-primary";

// ---------------------------------------------------------------------------------------
// My standing
// ---------------------------------------------------------------------------------------

export type StandingState = "disconnected" | "loading" | "none" | "ready";

/**
 * "Where am I": the trader's season total in the first currency as the headline, with the
 * three parts the backend splits it into, then one line for each further currency.
 */
export function MyStanding({
  state,
  standings,
  connect,
}: {
  state: StandingState;
  standings: StandingView[];
  /** The connect control, passed in so this stays free of the wallet. */
  connect?: React.ReactNode;
}) {
  if (state === "disconnected") {
    return (
      <AppCard className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className={cn(TYPE_LABEL, "text-content-primary")}>Your points</div>
          <p className={cn(TYPE_NOTE, "mt-1 text-content-secondary")}>Connect a wallet to see your points and rank. The boards below are open to everyone.</p>
        </div>
        <div className="shrink-0">{connect}</div>
      </AppCard>
    );
  }
  if (state === "loading") {
    return (
      <AppCard className="p-5" aria-hidden="true">
        <div className={cn(BONE, "h-4 w-24")} />
        <div className={cn(BONE, "mt-2 h-11 w-40 max-md:h-[35px]")} />
        <div className="mt-5 grid grid-cols-3 gap-x-6 border-t border-bg-border pt-5 max-md:grid-cols-1 max-md:gap-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <div className={cn(BONE, "h-4 w-16")} />
              <div className={cn(BONE, "h-[25px] w-20")} />
              <div className={cn(BONE, "h-4 w-28")} />
            </div>
          ))}
        </div>
      </AppCard>
    );
  }
  const [main, ...others] = standings;
  if (state === "none" || !main) {
    return (
      <AppCard className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <div className={cn(TYPE_LABEL, "text-content-primary")}>No points yet</div>
          <p className={cn(TYPE_NOTE, "mt-1 text-content-secondary")}>Points come from trades in a live league. The rules below say what counts.</p>
        </div>
        <AppButtonLink href="/trade" className="shrink-0">
          Trade
          <Chevron kind="go" className="h-4 w-4" />
        </AppButtonLink>
      </AppCard>
    );
  }
  return (
    <section aria-label="Your points">
      <AppCard className="p-5">
        <div className="flex min-h-8 items-center justify-between gap-4">
          <div className={LABEL}>Your {main.currencyTitle.toLowerCase()}</div>
          <div className={cn(TYPE_LABEL, "tabular-nums text-content-secondary")}>{main.rankText ? `Rank ${main.rankText}` : "Not ranked yet"}</div>
        </div>
        <div className="mt-2 font-mono text-[40px] font-semibold leading-[1.1] tracking-[-0.02em] tabular-nums text-content-primary max-md:text-[32px]">
          {main.points}
        </div>
        <div className="mt-5 grid grid-cols-3 gap-x-6 border-t border-bg-border pt-5 max-md:grid-cols-1 max-md:gap-y-5">
          {main.parts.map((part) => (
            <div key={part.label} className="flex min-w-0 flex-col gap-1.5">
              <div className={LABEL}>{part.label}</div>
              <div className={cn(TYPE_VALUE, "truncate tabular-nums text-content-primary")}>{part.value}</div>
              <div className={cn(TYPE_NOTE, "text-content-secondary")}>{part.note}</div>
            </div>
          ))}
        </div>
        {others.length > 0 ? (
          <dl className="mt-5 flex flex-col gap-2 border-t border-bg-border pt-5">
            {others.map((s) => (
              <div key={s.currency} className="flex items-baseline justify-between gap-4">
                <dt className={LABEL}>{s.currencyTitle}</dt>
                <dd className={cn(TYPE_LABEL, "tabular-nums text-content-primary")}>
                  {s.points}
                  <span className="font-normal text-content-secondary">{s.rankText ? `, rank ${s.rankText}` : ""}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </AppCard>
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------------------

/** Divider lines for a three-column grid that stacks on a phone: no gaps, no doubled borders. */
function cellBorders(index: number): string {
  return cn(index > 0 && "max-md:border-t", index % 3 !== 0 && "md:border-l", index >= 3 && "md:border-t", "border-bg-border");
}

/**
 * The season's open leagues as the page's main choice: picking one sets what the rules, the
 * board, the clans and the awards under it are about. Finished leagues sit in a line below.
 */
export function LeagueStrip({
  open,
  past,
  selected,
  onSelect,
  standingText,
}: {
  open: LeagueView[];
  past: LeagueView[];
  selected: number | null;
  onSelect: (id: number) => void;
  /** The trader's own line for a league ("42 pts, rank 9"), or null. */
  standingText: (leagueId: number) => string | null;
}) {
  return (
    <section aria-label="Leagues" className="flex flex-col gap-3">
      {open.length > 0 ? (
        <div role="tablist" aria-label="Open leagues" className="grid grid-cols-1 border border-bg-border md:grid-cols-3">
          {open.map((league, index) => {
            const active = league.id === selected;
            const mine = standingText(league.id);
            return (
              <button
                key={league.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelect(league.id)}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-2 p-5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/40 max-md:p-4",
                  cellBorders(index),
                  active ? "bg-accent-primary/10" : "bg-bg-primary hover:bg-action-primary",
                )}
              >
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="truncate font-mono text-[16px] font-medium leading-[1.2] tracking-[-0.02em] text-content-primary">{league.name}</span>
                  <AppPill active={league.live} className="shrink-0">
                    {league.phaseLabel}
                  </AppPill>
                </div>
                <span className={cn(TYPE_NOTE, "tabular-nums text-content-secondary")}>{league.timeText}</span>
                <span className={cn(TYPE_DENSE, "tabular-nums text-content-tertiary")}>
                  Expires {league.expiryText}
                  {league.dropText ? (
                    <>
                      <br />
                      Drop {league.dropText}
                    </>
                  ) : null}
                </span>
                <span className={cn(TYPE_LABEL, "tabular-nums", mine ? "text-content-primary" : "text-content-tertiary")}>{mine ?? "No points yet"}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <AppCard className={cn(TYPE_NOTE, "p-5 text-content-secondary")}>No league is open right now.</AppCard>
      )}
      {past.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className={LABEL}>Past leagues</span>
          {past.map((league) => {
            const active = league.id === selected;
            return (
              <button
                key={league.id}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(league.id)}
                className={cn(
                  TYPE_LABEL,
                  "border-b py-0.5 text-left font-normal transition-colors focus-visible:outline-none",
                  active ? "border-accent-primary text-content-primary" : "border-transparent text-content-secondary hover:text-content-primary focus-visible:text-content-primary",
                )}
              >
                {league.name}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------------------

/** The earned mark: a square, filled when the rule can be earned no further, outlined in the accent when partly earned. */
function EarnedMark({ row }: { row: RuleRow }) {
  const state = row.done ? "Earned" : row.earnedTimes > 0 ? "Partly earned" : "Not earned";
  return (
    <span
      role="img"
      aria-label={state}
      className={cn(
        "mt-[3px] block h-3 w-3 shrink-0 border",
        row.done ? "border-accent-primary bg-accent-primary" : row.earnedTimes > 0 ? "border-accent-primary bg-accent-primary/30" : "border-content-tertiary",
      )}
    />
  );
}

/**
 * A league's rules as a checklist. Titles and descriptions are the backend's own words; the
 * mark and the count come from the trader's awards, and are left out when no wallet is read.
 */
export function RulesList({ groups, hidden, showProgress }: { groups: RuleGroup[]; hidden: string | null; showProgress: boolean }) {
  if (groups.length === 0) {
    return <p className={cn(TYPE_NOTE, "text-content-secondary")}>{hidden ?? "This league has no rules published yet."}</p>;
  }
  return (
    <div className="flex flex-col gap-8">
      {groups.map((group) => (
        <section key={group.id} aria-label={group.title}>
          <div className="flex items-baseline justify-between gap-4 pb-3">
            <h3 className={cn(TYPE_LABEL, "text-content-primary")}>{group.title}</h3>
            <span className={cn(TYPE_DENSE, "tabular-nums text-content-tertiary")}>
              {group.budget
                ? showProgress
                  ? `${group.budget.earned} of ${group.budget.max} ${group.currencyTitle.toLowerCase()}`
                  : `Up to ${group.budget.max} ${group.currencyTitle.toLowerCase()}`
                : group.title === group.currencyTitle
                  ? null
                  : group.currencyTitle}
            </span>
          </div>
          <ul className="border-t border-bg-border">
            {group.rows.map((row) => (
              <li key={row.key} className="flex gap-3 border-b border-bg-border py-3">
                {showProgress ? <EarnedMark row={row} /> : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className={cn(TYPE_LABEL, "text-content-primary")}>{row.title}</span>
                      {row.tags.map((tag) => (
                        <span key={tag} className={cn(TYPE_DENSE, "text-accent-secondary")}>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <span className={cn(TYPE_LABEL, "shrink-0 tabular-nums text-content-primary")}>{row.pointsText}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <p className={cn(TYPE_NOTE, "min-w-0 text-content-secondary")}>{row.description}</p>
                    <span className={cn(TYPE_DENSE, "shrink-0 text-right tabular-nums text-content-tertiary")}>
                      {showProgress && row.progressText ? row.progressText : row.limitText}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hidden ? <p className={cn(TYPE_NOTE, "text-content-secondary")}>{hidden}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------------------

const TH = cn(TYPE_LABEL, "px-2.5 py-2.5 text-left text-content-tertiary");
const TD = "px-2.5 py-3 align-top font-mono text-[14px] leading-[1.2] tracking-[-0.02em]";

function TableSkeleton() {
  return (
    <div className="border border-bg-border" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between gap-6 border-b border-bg-border px-2.5 py-3 last:border-b-0">
          <div className={cn(BONE, "h-4 w-1/3")} />
          <div className={cn(BONE, "h-4 w-16")} />
        </div>
      ))}
    </div>
  );
}

export type OwnRow = { rank: number; points: string };

/**
 * A ranking of traders. The trader's own row is marked; when it is further down than the rows
 * shown, it is repeated under them, so "where am I" never needs a scroll.
 */
export function BoardTable({
  rows,
  status,
  own,
  loading,
  failed,
  canLoadMore,
  onLoadMore,
}: {
  rows: BoardRowView[];
  /** Where the figures stand: "Provisional, updated 3m ago". */
  status: string | null;
  /** The trader's own place on this board, from their standing. */
  own: OwnRow | null;
  loading: boolean;
  failed: boolean;
  canLoadMore: boolean;
  onLoadMore: () => void;
}) {
  if (rows.length === 0 && loading) return <TableSkeleton />;
  if (rows.length === 0) {
    return (
      <p role={failed ? "alert" : undefined} className={cn(TYPE_NOTE, failed ? "text-error" : "text-content-secondary")}>
        {failed ? "The board could not be loaded." : status === "Not counted yet" ? "This board has not been counted yet." : "Nobody is on this board yet."}
      </p>
    );
  }
  const ownShown = rows.some((r) => r.isMe);
  return (
    <div className="flex flex-col gap-3">
      {failed ? (
        <p role="alert" className={cn(TYPE_NOTE, "text-error")}>
          The board could not be refreshed. These figures may be out of date.
        </p>
      ) : status ? (
        <p className={cn(TYPE_DENSE, "text-content-tertiary")}>{status}</p>
      ) : null}
      <div className="border border-bg-border">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">Traders by points</caption>
          <colgroup>
            <col className="w-16" />
            <col />
            <col className="w-28" />
          </colgroup>
          <thead>
            <tr className="border-b border-bg-border">
              <th scope="col" className={TH}>
                Rank
              </th>
              <th scope="col" className={TH}>
                Trader
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.rank} className={cn("border-b border-bg-border last:border-b-0", row.isMe && "bg-accent-primary/10")}>
                <td className={cn(TD, "tabular-nums text-content-secondary")}>{row.rank}</td>
                <td className={cn(TD, "text-content-primary")}>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate" title={row.wallet ?? undefined}>
                      {row.name}
                    </span>
                    {row.isMe ? <span className={cn(TYPE_DENSE, "shrink-0 text-accent-secondary")}>You</span> : null}
                  </span>
                </td>
                <td className={cn(TD, "text-right tabular-nums text-content-primary")}>{row.points}</td>
              </tr>
            ))}
          </tbody>
          {own && !ownShown ? (
            <tfoot>
              <tr className="border-t border-bg-border bg-accent-primary/10">
                <td className={cn(TD, "tabular-nums text-content-secondary")}>{own.rank}</td>
                <td className={cn(TD, "text-content-primary")}>
                  <span className={cn(TYPE_DENSE, "text-accent-secondary")}>You</span>
                </td>
                <td className={cn(TD, "text-right tabular-nums text-content-primary")}>{own.points}</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
      {canLoadMore ? (
        <AppButton variant="secondary" onClick={onLoadMore} disabled={loading} className="self-start">
          {loading ? "Loading" : "Show more"}
        </AppButton>
      ) : null}
    </div>
  );
}

/** A ranking of clans. A clan that does not qualify yet says so under its name. */
export function ClanTable({ rows, status, loading, failed }: { rows: ClanRowView[]; status: string | null; loading: boolean; failed: boolean }) {
  if (rows.length === 0 && loading) return <TableSkeleton />;
  if (rows.length === 0) {
    return (
      <p role={failed ? "alert" : undefined} className={cn(TYPE_NOTE, failed ? "text-error" : "text-content-secondary")}>
        {failed ? "The clans could not be loaded." : "No clan is on this board yet."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {status ? <p className={cn(TYPE_DENSE, "text-content-tertiary")}>{status}</p> : null}
      <div className="border border-bg-border">
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">Clans by points</caption>
          <colgroup>
            <col className="w-16" />
            <col />
            <col className="w-28" />
          </colgroup>
          <thead>
            <tr className="border-b border-bg-border">
              <th scope="col" className={TH}>
                Rank
              </th>
              <th scope="col" className={TH}>
                Clan
              </th>
              <th scope="col" className={cn(TH, "text-right")}>
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-bg-border last:border-b-0">
                <td className={cn(TD, "tabular-nums text-content-secondary")}>{row.rank}</td>
                <td className={cn(TD, "text-content-primary")}>
                  <span className="block truncate">{row.name}</span>
                  <span className={cn(TYPE_DENSE, "mt-1 block tabular-nums text-content-tertiary")}>
                    {row.membersText}
                    {row.qualified ? "" : ". Not qualified yet"}
                  </span>
                </td>
                <td className={cn(TD, "text-right tabular-nums text-content-primary")}>{row.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// My awards
// ---------------------------------------------------------------------------------------

const AWARDS_STEP = 25;

/** The trader's awards, newest first: what was earned, in which league, and when. */
export function AwardsList({
  lines,
  nowSecs,
  state,
  truncated,
}: {
  lines: AwardLine[];
  nowSecs: number;
  state: "disconnected" | "loading" | "failed" | "ready";
  /** Older awards exist beyond the ones read. */
  truncated: boolean;
}) {
  const [shown, setShown] = React.useState(AWARDS_STEP);
  if (state === "disconnected") return <p className={cn(TYPE_NOTE, "text-content-secondary")}>Connect a wallet to see what it has earned.</p>;
  if (state === "loading") return <TableSkeleton />;
  if (state === "failed" && lines.length === 0) {
    return (
      <p role="alert" className={cn(TYPE_NOTE, "text-error")}>
        Your awards could not be loaded.
      </p>
    );
  }
  if (lines.length === 0) return <p className={cn(TYPE_NOTE, "text-content-secondary")}>Nothing earned here yet.</p>;
  const visible = lines.slice(0, shown);
  return (
    <div className="flex flex-col gap-3">
      {truncated ? <p className={cn(TYPE_DENSE, "text-content-tertiary")}>Showing the most recent {lines.length} awards.</p> : null}
      <ul className="border border-bg-border">
        {visible.map((line) => (
          <li key={line.id} className="flex items-baseline justify-between gap-4 border-b border-bg-border px-2.5 py-3 last:border-b-0">
            <div className="min-w-0">
              <div className={cn(TYPE_LABEL, "truncate text-content-primary")}>{line.title}</div>
              <div className={cn(TYPE_DENSE, "mt-1 truncate text-content-tertiary")}>
                {line.leagueName}, {line.currencyTitle.toLowerCase()}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className={cn(TYPE_LABEL, "tabular-nums", line.negative ? "text-additional-red-primary" : "text-additional-green-primary")}>{line.points}</div>
              <div className={cn(TYPE_DENSE, "mt-1 tabular-nums text-content-tertiary")}>{formatAgo(line.at, nowSecs)}</div>
            </div>
          </li>
        ))}
      </ul>
      {lines.length > shown ? (
        <AppButton variant="secondary" onClick={() => setShown((n) => n + AWARDS_STEP)} className="self-start">
          Show more
        </AppButton>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Whole-page states
// ---------------------------------------------------------------------------------------

/** The page while the season loads: the standing card, three league cells and a panel. */
export function RewardsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <MyStanding state="loading" standings={[]} />
      <div className="grid grid-cols-1 border border-bg-border md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn("flex flex-col gap-2 p-5 max-md:p-4", cellBorders(i))}>
            <div className={cn(BONE, "h-5 w-24")} />
            <div className={cn(BONE, "h-4 w-20")} />
            <div className={cn(BONE, "h-8 w-36")} />
            <div className={cn(BONE, "h-4 w-24")} />
          </div>
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}

export function LoadingStatus() {
  return (
    <p role="status" className="sr-only">
      Loading the season
    </p>
  );
}

/** No season is published. What the devnet backend answers until the first one opens. */
export function NoSeason() {
  return (
    <AppCard className="flex flex-col items-center px-6 py-12 text-center">
      <p className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">No season is running yet</p>
      <p className="mt-2 max-w-md font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
        When one opens, its leagues, rules and boards show here. Trading is open in the meantime.
      </p>
      <AppButtonLink href="/trade" className="mt-6">
        Trade
        <Chevron kind="go" className="h-4 w-4" />
      </AppButtonLink>
    </AppCard>
  );
}

/** The season could not be read at all. */
export function SeasonFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <AppCard className="flex flex-col items-center px-6 py-12 text-center">
      <p role="alert" className="font-space text-2xl font-semibold leading-[1.2] tracking-[-0.48px] text-content-primary">
        Rewards could not be loaded
      </p>
      <p className="mt-2 max-w-md font-mono text-sm leading-[1.5] tracking-[-0.02em] text-content-secondary">
        The season did not come back from the server. Your points are not affected.
      </p>
      <AppButton variant="secondary" onClick={onRetry} className="mt-6">
        Try again
      </AppButton>
    </AppCard>
  );
}
