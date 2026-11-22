import { LockIcon, TeamLogo, TrophyIcon } from "@/components/ui";
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
  // No pick yet: just a small tag, not the full card.
  if (!team || !game || !side) {
    const out = empty.startsWith("Eliminated");
    return (
      <section className={`flex w-fit max-w-full items-center gap-2 rounded-xl border-2 border-accent bg-surface px-3 py-1.5 ${className}`} aria-label={`${weekLabel} pick`}>
        {/* An eliminated entry has no pick to make: just "Eliminated in Week N". */}
        {!out && <span className="truncate text-xs font-semibold uppercase tracking-wide text-accent">{weekLabel} Pick</span>}
        <span className={`whitespace-nowrap text-sm font-semibold ${out ? "text-loss" : "text-muted"}`}>{empty}</span>
      </section>
    );
  }
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

/**
 * An eliminated entry's My Pick: the pick that knocked it out, laid out like the pick card, in
 * red: "Eliminated · Week N", the team and its opponent, the final score and "Lost". Out on a
 * missed week (no pick), just "Eliminated in Week N · No pick".
 */
export function EliminatedCard({
  week,
  game,
  side,
  className = "",
}: {
  week: number;
  game: SlateGame | null;
  side: Side | null;
  className?: string;
}) {
  const team = game && side ? game[side] : null;
  const box = `rounded-2xl border-2 border-loss/60 bg-[var(--loss-fill)] ${className}`;
  if (!team || !game || !side) {
    return (
      <section className={`flex w-fit max-w-full items-center gap-2 px-3 py-1.5 ${box}`} aria-label={`Eliminated in Week ${week}`}>
        <span className="whitespace-nowrap text-lg font-bold text-loss">Eliminated in Week {week}</span>
        <span className="whitespace-nowrap text-sm text-muted">· No pick</span>
      </section>
    );
  }
  const mine = side === "home" ? game.homeScore : game.awayScore;
  const theirs = side === "home" ? game.awayScore : game.homeScore;
  return (
    <section className={`px-4 py-3 ${box}`} aria-label={`Eliminated in Week ${week}`}>
      <div className="truncate text-xs font-semibold uppercase tracking-wide text-loss">Eliminated · Week {week}</div>
      <div className="mt-1.5 flex items-center gap-3">
        <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-extrabold leading-tight tracking-[-0.02em] text-ink">{teamName(team)}</div>
          <div className="truncate text-sm text-muted">
            {side === "away" && !game.neutral ? "at" : "vs"} {teamName(side === "home" ? game.away : game.home)}
          </div>
        </div>
        {mine !== null && theirs !== null && (
          <div className="shrink-0 text-right">
            <div className="text-xl font-extrabold tabular-nums leading-tight text-ink">
              {mine}–{theirs}
            </div>
            <div className="text-xs font-semibold text-loss">{mine === theirs ? "Tied" : "Lost"}</div>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The pool is over: who won. "You won the pool!" for the winner; everyone else sees the
 * winner's name. Shared when everyone left went out in the same week.
 */
export function WinnerCard({
  names,
  mine,
  prize,
  compact = false,
  className = "",
}: {
  names: string[];
  /** The week it was decided (kept for callers). */
  week?: number;
  /** The viewer is (one of) the winner(s). */
  mine: boolean;
  /** "$9,450", or "$4,725 each" when shared; omitted without an entry fee. */
  prize?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const shared = names.length > 1;
  return (
    <section className={`rounded-2xl border-2 border-accent bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg))] px-4 py-3 ${className}`} aria-label="Pool winner">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
        <TrophyIcon className="size-3.5" />
        {shared ? "Pool winners" : "Pool winner"}
      </div>
      <div className={`mt-1 font-extrabold leading-tight tracking-[-0.02em] text-ink ${compact ? "text-2xl" : "text-2xl sm:text-3xl"}`}>
        {mine && !shared ? "You won the pool!" : names.join(" & ")}
      </div>
      {(shared || prize) && (
        <div className="mt-0.5 text-sm text-muted">
          {shared && "Shared"}
          {shared && prize ? " · " : null}
          {prize ? <span className="font-semibold text-win">{prize}</span> : null}
        </div>
      )}
    </section>
  );
}
