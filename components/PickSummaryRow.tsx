import { formatSpread, shortGameTime, signedPoints } from "@/lib/format";
import { hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";
import { LiveDot, LockIcon, TeamLogo } from "./ui";

const teamName = (team: SlateGame["home"]) => team.short_name ?? team.name;

/**
 * One pick as a compact row: the side taken (with its spread and points), the opponent, and
 * where the game stands (time, Live, score, Win/Loss/Push). Used by My Picks on the Picks tab
 * and by Pick History. In a confidence pool a decided pick shows the points it won or lost
 * (+5, −3) in place of Win/Loss.
 */
export function PickSummaryRow({
  game: g,
  side,
  confidence,
  result,
  points,
  locked,
  now,
  pickType,
  timezone,
  dense = false,
}: {
  game: SlateGame;
  side: "home" | "away";
  confidence: number | null;
  /** The graded result (picks.result), if any. */
  result: string | null | undefined;
  /** Confidence pools: what the decided pick scored, bonus included; null otherwise. */
  points?: number | null;
  locked: boolean;
  now: number;
  pickType: "straight_up" | "ats";
  timezone: string;
  /** Tighter rows (My Picks on the Picks tab), so a full card needs less scrolling. */
  dense?: boolean;
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

  const rowClass = `flex items-center ${dense ? "min-h-9 gap-2 py-1" : "min-h-11 gap-2.5 py-2"} ${g.voided ? "opacity-50" : ""}`;

  // Confidence pools (basketball): Logo · Team · @/vs Opponent · (Live) score · points.
  // Points are the confidence value in blue until the game is decided, then what the pick won
  // (green) or lost (red). The score shows once the game starts, tagged Live while it's on.
  if (confidence != null) {
    const decided = points != null && (result === "win" || result === "loss" || final);
    return (
      <li className={rowClass}>
        <TeamLogo src={team.logo_url} abbr={team.abbreviation} className={dense ? "size-5" : "size-6"} />
        <span className={`min-w-0 flex-1 truncate ${dense ? "text-sm" : "text-[15px]"}`}>
          <span className="font-semibold">{teamName(team)}</span>
          <span className="ml-1.5 text-sm text-muted">
            {side === "away" && !g.neutral ? "@" : "vs"} {opp.abbreviation ?? teamName(opp)}
          </span>
        </span>
        {/* Score (with Live while it's on) first, then the points on the far right. */}
        <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-muted">
          {live && <LiveDot>{g.clock ?? "Live"}</LiveDot>}
          {score && !g.voided && <span className="font-semibold text-ink">{score}</span>}
          {g.voided ? (
            <span className="font-semibold text-loss">Void</span>
          ) : (
            <span
              className={`min-w-6 text-right text-sm font-semibold ${
                !decided ? "text-accent" : points! > 0 ? "text-win" : points! < 0 ? "text-loss" : "text-ink"
              }`}
              aria-label={decided ? `${signedPoints(points)} points` : `${confidence} confidence points`}
            >
              {decided ? signedPoints(points) : confidence}
            </span>
          )}
        </span>
      </li>
    );
  }

  return (
    <li className={`flex items-center ${dense ? "min-h-9 gap-2 py-1" : "min-h-11 gap-2.5 py-2"} ${g.voided ? "opacity-50" : ""}`}>
      <TeamLogo src={team.logo_url} abbr={team.abbreviation} className={dense ? "size-5" : "size-6"} />
      <span className={`min-w-0 flex-1 truncate ${dense ? "text-sm" : "text-[15px]"}`}>
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
        ) : points != null && (result === "win" || result === "loss" || final) ? (
          // Confidence pools: the points the pick won or lost.
          <span className={`text-sm font-semibold ${points > 0 ? "text-win" : points < 0 ? "text-loss" : "text-ink"}`}>
            {signedPoints(points)}
          </span>
        ) : result === "win" || result === "loss" || result === "push" ? (
          <span className={`font-semibold ${result === "win" ? "text-win" : result === "loss" ? "text-loss" : "text-ink"}`}>
            {result === "win" ? "Win" : result === "loss" ? "Loss" : "Push"}
          </span>
        ) : final ? (
          <span className="font-semibold">Final</span>
        ) : live ? (
          <LiveDot>{g.clock ?? "Live"}</LiveDot>
        ) : (
          <span>{shortGameTime(g.startAt, timezone, g.timeTbd)}</span>
        )}
        {score && <span className="font-semibold text-ink">{score}</span>}
        {locked && !started && <LockIcon className="size-3 shrink-0" />}
      </span>
    </li>
  );
}
