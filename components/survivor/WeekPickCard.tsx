import { LockIcon, TeamLogo } from "@/components/ui";
import { shortGameTime } from "@/lib/format";
import type { SlateGame } from "@/lib/pool";

type Side = "home" | "away";
const teamName = (t: SlateGame["home"]) => t.short_name ?? t.name;

/**
 * This week's Survivor pick, the same on My Pick and Home: a small "Week N Pick" label, the
 * team's logo and name large, the opponent with kickoff time and TV (or the live clock, or
 * Final) under it, and once the game starts the score on the right with how it's going.
 */
export function WeekPickCard({
  weekLabel,
  game,
  side,
  started,
  locked,
  timezone,
  empty,
  compact = false,
  className = "",
}: {
  weekLabel: string;
  game: SlateGame | null;
  side: Side | null;
  started: boolean;
  locked: boolean;
  timezone: string;
  /** What to say with no pick ("No pick yet: tap a team below"). */
  empty: string;
  /** A narrow column (Home): a little smaller. */
  compact?: boolean;
  className?: string;
}) {
  const team = game && side ? game[side] : null;
  const final = Boolean(game && (game.status === "final" || game.overridden));
  const mine = game && side ? (side === "home" ? game.homeScore : game.awayScore) : null;
  const theirs = game && side ? (side === "home" ? game.awayScore : game.homeScore) : null;
  return (
    <section className={`rounded-2xl border-2 border-accent bg-surface px-4 py-3 ${className}`} aria-label={`${weekLabel} pick`}>
      <div className="truncate text-xs font-semibold uppercase tracking-wide text-accent">{weekLabel} Pick</div>
      {team && game && side ? (
        <div className="mt-1.5 flex items-center gap-3">
          <TeamLogo src={team.logo_url} abbr={team.abbreviation} className={`${compact ? "size-10" : "size-12"} shrink-0`} />
          <div className="min-w-0 flex-1">
            <div className={`truncate font-extrabold leading-tight tracking-[-0.02em] ${compact ? "text-2xl" : "text-2xl sm:text-3xl"}`}>{teamName(team)}</div>
            <div className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
              <span className="truncate">
                {side === "away" && !game.neutral ? "at" : "vs"} {teamName(side === "home" ? game.away : game.home)}
                {compact && <br />}
                {started ? (
                  final ? (
                    compact ? "Final" : " · Final"
                  ) : (
                    <span className="text-live">{compact ? "" : " · "}Live{game.clock ? ` ${game.clock}` : ""}</span>
                  )
                ) : (
                  <>
                    {compact ? "" : " · "}
                    {shortGameTime(game.startAt, timezone, game.timeTbd)}
                    {game.tv ? ` · ${game.tv}` : ""}
                  </>
                )}
              </span>
              {locked && <LockIcon className="size-3.5 shrink-0" />}
            </div>
          </div>
          {started && mine !== null && theirs !== null && (
            <div className="shrink-0 text-right">
              <div className={`font-extrabold tabular-nums leading-tight ${compact ? "text-xl" : "text-2xl"}`}>
                {mine}–{theirs}
              </div>
              <div className={`text-xs font-semibold ${mine > theirs ? "text-win" : mine < theirs ? "text-loss" : "text-muted"}`}>
                {final ? (mine > theirs ? "Won" : mine < theirs ? "Lost" : "Tied") : mine > theirs ? "Leading" : mine < theirs ? "Trailing" : "Tied"}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-1 text-base font-semibold text-muted">{empty}</p>
      )}
    </section>
  );
}
