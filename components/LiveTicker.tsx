import type { CSSProperties } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { dayKey } from "@/lib/format";
import { gameDateZone, hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

type State = "live" | "upcoming" | "final" | "off";

/**
 * Every game on the week's slate: live games first (with the score and TV channel), then the
 * ones still to come (day, date and time), then finals (with the score). Within each group the
 * days run in order, and each day leads with its ranked games, best rank first, before the rest
 * by start time; a day without ranked games is simply in start order. Slides like a ticker when
 * there are three or more; otherwise a plain row. Server-rendered: AutoRefresh reloads the page
 * while a game is live.
 */
export function LiveTicker({
  games,
  now,
  timezone,
  className = "",
}: {
  games: SlateGame[];
  now: number;
  timezone: string;
  className?: string;
}) {
  const stateOf = (g: SlateGame): State => {
    if (g.status === "final" || g.overridden) return "final";
    if (g.status === "postponed" || g.status === "cancelled") return "off";
    return hasStarted(g, now) ? "live" : "upcoming";
  };
  const order: Record<State, number> = { live: 0, upcoming: 1, off: 2, final: 3 };
  // The game's best (lowest) AP rank; unranked games sort after every ranked one.
  const bestRank = (g: SlateGame) => Math.min(g.homeRank ?? 99, g.awayRank ?? 99);
  const day = (g: SlateGame) => dayKey(g.startAt, gameDateZone(g.timeTbd, timezone));
  // games come sorted by kickoff; a stable sort keeps that order among equals.
  const items = games
    .filter((g) => !g.voided)
    .map((g) => ({ g, state: stateOf(g) }))
    .sort(
      (a, b) =>
        order[a.state] - order[b.state] ||
        day(a.g).localeCompare(day(b.g)) ||
        bestRank(a.g) - bestRank(b.g),
    );

  if (!items.length) return null;

  const moving = items.length >= 3;
  const chips = (copy: boolean) => (
    <ul className={`flex shrink-0 gap-2 ${moving ? "pr-2" : ""} ${copy ? "ticker-copy" : ""}`} aria-hidden={copy || undefined}>
      {items.map(({ g, state }) => (
        <li key={g.id}>
          <Chip game={g} state={state} timezone={timezone} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`min-w-0 ${className}`} aria-label="This week's games">
      <div className={`ticker overflow-hidden ${moving ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]" : ""}`}>
        {/* About 5 seconds per game keeps it readable. */}
        <div
          className={`flex w-max ${moving ? "ticker-track" : ""}`}
          style={moving ? ({ "--ticker-duration": `${Math.max(20, items.length * 5)}s` } as CSSProperties) : undefined}
        >
          {chips(false)}
          {moving && chips(true)}
        </div>
      </div>
    </div>
  );
}

function Chip({ game: g, state, timezone }: { game: SlateGame; state: State; timezone: string }) {
  const scored = state === "live" || state === "final";
  const away = g.awayScore ?? 0;
  const home = g.homeScore ?? 0;
  const team = (abbr: string | null, rank: number | null, score: number, leads: boolean) => (
    <span className={scored && leads ? "font-semibold text-ink" : scored ? "text-muted" : "font-medium text-ink"}>
      {rank ? <span className="mr-0.5 text-[10px] font-medium tabular-nums text-muted">{rank}</span> : null}
      {abbr}
      {scored && <span className="ml-1 tabular-nums">{score}</span>}
    </span>
  );
  // "Sat 10/24 · 11:00 AM"; a TBD game's date is read in Eastern, like everywhere else.
  const when = g.timeTbd
    ? `${formatInTimeZone(g.startAt, gameDateZone(true, timezone), "EEE M/d")} · TBD`
    : formatInTimeZone(g.startAt, timezone, "EEE M/d · h:mm a");

  return (
    <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-2.5 text-xs">
      {state === "live" && (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-live">
          <span className="sr-only">Live:</span>
        </span>
      )}
      {state === "final" && <span className="font-semibold text-muted">Final</span>}
      {team(g.away.abbreviation, g.awayRank, away, away > home)}
      <span className="text-faint">{g.neutral ? "vs" : "@"}</span>
      {team(g.home.abbreviation, g.homeRank, home, home > away)}
      {/* Live: the clock (when ESPN has it) and where to watch it. */}
      {state === "live" && g.clock && <span className="tabular-nums text-ink">{g.clock}</span>}
      {state === "live" && g.tv && <span className="text-muted">{g.tv}</span>}
      {state === "upcoming" && <span className="tabular-nums text-muted">{when}</span>}
      {state === "off" && <span className="text-muted">{g.status === "postponed" ? "Postponed" : "Cancelled"}</span>}
    </span>
  );
}
