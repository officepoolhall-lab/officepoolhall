import { FitText } from "@/components/FitText";
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
  bar = false,
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
  /** My Pick: one bar the same height with or without a pick (logo or a dashed "?"). */
  bar?: boolean;
  className?: string;
}) {
  const team = game && side ? game[side] : null;
  const final = Boolean(game && (game.status === "final" || game.overridden));
  const mine = game && side ? (side === "home" ? game.homeScore : game.awayScore) : null;
  const theirs = game && side ? (side === "home" ? game.awayScore : game.homeScore) : null;
  if (bar) {
    const out = empty.startsWith("Eliminated");
    const when = game
      ? started
        ? final
          ? "Final"
          : null
        : `${shortGameTime(game.startAt, timezone, game.timeTbd)}${game.tv ? ` · ${game.tv}` : ""}`
      : null;
    return (
      <section className={`flex min-w-0 items-center gap-3 rounded-xl border-2 border-accent bg-surface px-3.5 py-2.5 ${className}`} aria-label={`${weekLabel} pick`}>
        {team ? (
          <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-10 shrink-0" />
        ) : (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-line text-lg font-bold text-muted" aria-hidden>
            ?
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold uppercase tracking-wide text-accent">{weekLabel} Pick</div>
          {team && game && side ? (
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-xl font-extrabold leading-tight tracking-[-0.02em] sm:text-2xl">{teamName(team)}</span>
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted">
                <span className="truncate">
                  {side === "away" && !game.neutral ? "at" : "vs"} {teamName(side === "home" ? game.away : game.home)}
                  {when ? ` · ${when}` : null}
                  {started && !final && <span className="text-live"> · Live{game.clock ? ` ${game.clock}` : ""}</span>}
                </span>
                {locked && <LockIcon className="size-3.5 shrink-0" />}
              </span>
            </div>
          ) : (
            <div className={`truncate text-xl font-bold leading-tight sm:text-2xl ${out ? "text-loss" : "text-muted"}`}>{empty}</div>
          )}
        </div>
        {started && mine !== null && theirs !== null && (
          <div className="shrink-0 text-right">
            <div className="text-xl font-extrabold tabular-nums leading-tight">
              {mine}–{theirs}
            </div>
            <div className={`text-xs font-semibold ${mine > theirs ? "text-win" : mine < theirs ? "text-loss" : "text-muted"}`}>
              {final ? (mine > theirs ? "Won" : mine < theirs ? "Lost" : "Tied") : mine > theirs ? "Leading" : mine < theirs ? "Trailing" : "Tied"}
            </div>
          </div>
        )}
      </section>
    );
  }
  // No pick yet: just a small tag, not the full card.
  if (!team || !game || !side) {
    const out = empty.startsWith("Eliminated");
    return (
      <section
        className={`flex w-fit max-w-full items-center rounded-xl border-2 border-accent bg-surface ${compact ? "gap-2 px-3 py-1.5" : "gap-3 px-4 py-2.5"} ${className}`}
        aria-label={`${weekLabel} pick`}
      >
        {/* An eliminated entry has no pick to make: just "Eliminated in Week N". My Pick's is a
            size up from Home's. */}
        {!out && <span className={`truncate font-semibold uppercase tracking-wide text-accent ${compact ? "text-xs" : "text-sm"}`}>{weekLabel} Pick</span>}
        <span className={`whitespace-nowrap font-semibold ${compact ? "text-sm" : "text-lg"} ${out ? "text-loss" : "text-muted"}`}>{empty}</span>
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
  week,
  mine,
  prize,
  compact = false,
  split = false,
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
  /** Ended by agreement: every remaining entry asked to split the pot. */
  split?: boolean;
  className?: string;
}) {
  if (split) return <SplitCard names={names} mine={mine} each={prize ?? null} week={week} compact={compact} className={className} />;
  const shared = names.length > 1;
  const list = names.length > 2 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : names.join(" & ");
  return (
    <section className={`rounded-2xl border-2 border-accent bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg))] px-4 py-3 ${className}`} aria-label="Pool winner">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-accent">
        <TrophyIcon className="size-3.5" />
        {split ? "Pot split" : shared ? "Pool winners" : "Pool winner"}
      </div>
      <div className={`mt-1 font-extrabold leading-tight tracking-[-0.02em] text-ink ${split && names.length > 2 ? "text-lg" : compact ? "text-2xl" : "text-2xl sm:text-3xl"}`}>
        {mine && !shared ? "You won the pool!" : list}
      </div>
      {(shared || prize) && (
        <div className="mt-0.5 text-sm text-muted">
          {split ? "Everyone left agreed to split" : shared && "Shared"}
          {shared && prize ? " · " : null}
          {prize ? <span className="font-semibold text-win">{prize}</span> : null}
        </div>
      )}
    </section>
  );
}

/**
 * The pot was split: every entry left agreed to end the pool. Leads with that and what each
 * entry gets; who shares it is a small list under it (the viewer's own name marked).
 */
export function SplitCard({
  names,
  each,
  week,
  you,
  compact = false,
  className = "",
}: {
  names: string[];
  mine: boolean;
  /** "$475 each"; omitted without an entry fee. */
  each: string | null;
  week?: number;
  /** The viewer's own name, to mark in the list. */
  you?: string;
  compact?: boolean;
  className?: string;
}) {
  const amount = each?.replace(/ (each|per entry)$/, "");
  // Every line stays on one line, shrinking to fit the card; the names go two to a row.
  return (
    <section
      className={`rounded-2xl border-2 border-win/70 bg-[var(--win-fill)] ${compact ? "px-4 py-3" : "px-4 py-3.5 sm:px-5"} ${className}`}
      aria-label="Pot split"
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-win">
        <TrophyIcon className="size-3.5 shrink-0" />
        <FitText min={9} className="min-w-0 flex-1">Pool over{week ? ` · Week ${week}` : ""}</FitText>
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <FitText min={14} className={`font-extrabold leading-tight tracking-[-0.02em] text-ink ${compact ? "text-2xl" : "text-2xl sm:text-3xl"}`}>The Pot was Split {names.length} Ways</FitText>
        </div>
        {amount && (
          <div className="shrink-0 text-right">
            <div className={`font-extrabold leading-none tabular-nums text-win ${compact ? "text-[1.75rem]" : "text-3xl sm:text-4xl"}`}>{amount}</div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap text-muted">per entry</div>
          </div>
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-win/30 pt-2 text-[13px] leading-snug text-ink">
        {names.map((n, i) => (
          <li key={n + i} className="min-w-0">
            <FitText min={9} className={n === you ? "font-semibold text-accent" : ""}>{n}</FitText>
          </li>
        ))}
      </ul>
    </section>
  );
}
