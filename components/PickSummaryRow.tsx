import { formatSpread, shortGameTime } from "@/lib/format";
import { hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";
import { LiveDot, LockIcon, TeamLogo } from "./ui";

const teamName = (team: SlateGame["home"]) => team.short_name ?? team.name;

/**
 * One pick as a compact row: the side taken (with its spread and points), the opponent, and
 * where the game stands (time, Live, score, Win/Loss/Push). Used by My Picks on the Picks tab
 * and by Pick History.
 */
export function PickSummaryRow({
  game: g,
  side,
  confidence,
  result,
  locked,
  now,
  pickType,
  timezone,
}: {
  game: SlateGame;
  side: "home" | "away";
  confidence: number | null;
  /** The graded result (picks.result), if any. */
  result: string | null | undefined;
  locked: boolean;
  now: number;
  pickType: "straight_up" | "ats";
  timezone: string;
}) {
  const team = side === "home" ? g.home : g.away;
  const opp = side === "home" ? g.away : g.home;
  const spread = g.spread === null ? null : side === "home" ? g.spread : -g.spread;
  const started = hasStarted(g, now);
  const final = g.status === "final" || g.overridden;
  const live = started && !final && g.status !== "postponed" && g.status !== "cancelled";
  const mine = side === "home" ? g.homeScore : g.awayScore;
  const theirs = side === "home" ? g.awayScore : g.homeScore;
  const score = started && mine !== null && theirs !== null ? `${mine}–${theirs}` : null;

  return (
    <li className={`flex min-h-11 items-center gap-2.5 py-2 ${g.voided ? "opacity-50" : ""}`}>
      <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-6" />
      <span className="min-w-0 flex-1 truncate text-[15px]">
        <span className="font-semibold">{teamName(team)}</span>
        {pickType === "ats" && <span className="ml-1.5 font-semibold tabular-nums text-accent">{formatSpread(spread)}</span>}
        {confidence != null && <span className="ml-1.5 text-xs tabular-nums text-muted">{confidence} pts</span>}
        <span className="ml-1.5 text-sm text-muted">
          {side === "away" && !g.neutral ? "@" : "vs"} {opp.abbreviation ?? teamName(opp)}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-muted">
        {g.voided ? (
          <span className="font-semibold text-loss">Void</span>
        ) : result === "win" || result === "loss" || result === "push" ? (
          <span className={`font-semibold ${result === "win" ? "text-win" : result === "loss" ? "text-loss" : "text-ink"}`}>
            {result === "win" ? "Win" : result === "loss" ? "Loss" : "Push"}
          </span>
        ) : final ? (
          <span className="font-semibold">Final</span>
        ) : live ? (
          <LiveDot>Live</LiveDot>
        ) : (
          <span>{shortGameTime(g.startAt, timezone, g.timeTbd)}</span>
        )}
        {score && <span className="font-semibold text-ink">{score}</span>}
        {locked && !started && <LockIcon className="size-3 shrink-0" />}
      </span>
    </li>
  );
}
