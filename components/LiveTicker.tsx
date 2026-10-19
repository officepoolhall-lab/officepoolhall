import type { CSSProperties } from "react";
import { hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

/** Finals stay on the ticker this long after kickoff, so a game that just ended doesn't vanish. */
const RECENT_MS = 12 * 3_600_000;

/**
 * Scores for the week's games in progress, then the ones that just went final. Slides like a
 * ticker when there are three or more; otherwise a plain row. Server-rendered: AutoRefresh
 * reloads the page while a game is live.
 */
export function LiveTicker({ games, now, className = "" }: { games: SlateGame[]; now: number; className?: string }) {
  const isFinal = (g: SlateGame) => g.status === "final" || g.overridden;
  const live = games.filter(
    (g) => !g.voided && hasStarted(g, now) && !isFinal(g) && g.status !== "postponed" && g.status !== "cancelled",
  );
  const recent = games
    .filter((g) => !g.voided && isFinal(g) && now - new Date(g.startAt).getTime() < RECENT_MS)
    .sort((a, b) => b.startAt.localeCompare(a.startAt));
  const items = [...live, ...recent];

  if (!items.length) {
    // Only worth saying once the week has games under way or coming up.
    return games.length ? <p className={`text-xs text-muted ${className}`}>No games live right now</p> : null;
  }

  const moving = items.length >= 3;
  const chips = (copy: boolean) => (
    <ul className={`flex shrink-0 gap-2 ${moving ? "pr-2" : ""} ${copy ? "ticker-copy" : ""}`} aria-hidden={copy || undefined}>
      {items.map((g) => (
        <li key={g.id}>
          <Score game={g} live={!isFinal(g)} />
        </li>
      ))}
    </ul>
  );

  return (
    <div className={`min-w-0 ${className}`} aria-label="Live scores">
      <div className={`ticker overflow-hidden ${moving ? "[mask-image:linear-gradient(to_right,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)]" : ""}`}>
        {/* About 6 seconds per score keeps it readable. */}
        <div
          className={`flex w-max ${moving ? "ticker-track" : ""}`}
          style={moving ? ({ "--ticker-duration": `${Math.max(20, items.length * 6)}s` } as CSSProperties) : undefined}
        >
          {chips(false)}
          {moving && chips(true)}
        </div>
      </div>
    </div>
  );
}

function Score({ game: g, live }: { game: SlateGame; live: boolean }) {
  const away = g.awayScore ?? 0;
  const home = g.homeScore ?? 0;
  const team = (abbr: string | null, score: number, leads: boolean) => (
    <span className={leads ? "font-semibold text-ink" : "text-muted"}>
      {abbr} <span className="tabular-nums">{score}</span>
    </span>
  );
  return (
    <span className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-2.5 text-xs">
      {live ? (
        <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-live">
          <span className="sr-only">Live:</span>
        </span>
      ) : (
        <span className="font-semibold text-muted">Final</span>
      )}
      {team(g.away.abbreviation, away, away > home)}
      <span className="text-faint">{g.neutral ? "vs" : "@"}</span>
      {team(g.home.abbreviation, home, home > away)}
    </span>
  );
}
