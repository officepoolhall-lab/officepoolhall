import type { CSSProperties } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { gameDateZone, hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

type State = "live" | "upcoming" | "final" | "off";

/**
 * Every game on the week's slate: live games first (with the score), then the ones still to
 * come in kickoff order (day, date and time), then finals (with the score). Slides like a
 * ticker when there are three or more; otherwise a plain row. Server-rendered: AutoRefresh
 * reloads the page while a game is live.
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
  // games come sorted by kickoff; a stable sort keeps that order within each group.
  const items = games
    .filter((g) => !g.voided)
    .map((g) => ({ g, state: stateOf(g) }))
    .sort((a, b) => order[a.state] - order[b.state]);

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
  const team = (abbr: string | null, score: number, leads: boolean) => (
    <span className={scored && leads ? "font-semibold text-ink" : scored ? "text-muted" : "font-medium text-ink"}>
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
      {team(g.away.abbreviation, away, away > home)}
      <span className="text-faint">{g.neutral ? "vs" : "@"}</span>
      {team(g.home.abbreviation, home, home > away)}
      {state === "upcoming" && <span className="tabular-nums text-muted">{when}</span>}
      {state === "off" && <span className="text-muted">{g.status === "postponed" ? "Postponed" : "Cancelled"}</span>}
    </span>
  );
}
