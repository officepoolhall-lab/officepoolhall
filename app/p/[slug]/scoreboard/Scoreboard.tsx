"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FootballIcon } from "@/components/FootballIcon";
import { LiveDot, TeamLogo } from "@/components/ui";
import { useLiveGames } from "@/components/useLiveGames";
import { dayKey, dayLabel, formatSpread, timeOnly } from "@/lib/format";
import { gameDateZone, hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

/**
 * Every game on the week's slate as a scoreboard: live games update every 10 seconds (score,
 * clock and period, who has the ball, down and distance, last play), like My Picks, and live
 * or final games open the full play-by-play and box score.
 */
export function Scoreboard({
  slug,
  week,
  games,
  timezone,
  sport,
  records,
  ats,
}: {
  slug: string;
  week: number;
  games: SlateGame[];
  timezone: string;
  sport: "ncaaf" | "ncaab";
  /** ESPN team id → overall record ("6-0"). */
  records: Record<string, string>;
  /** Against-the-spread pool: show each game's line. */
  ats: boolean;
}) {
  const now = useTicking();
  const shown = useLiveGames(games, now, sport);

  const days: { key: string; label: string; games: SlateGame[] }[] = [];
  for (const g of shown) {
    const zone = gameDateZone(g.timeTbd, timezone);
    const key = dayKey(g.startAt, zone);
    const day = days.find((d) => d.key === key);
    if (day) day.games.push(g);
    else days.push({ key, label: dayLabel(g.startAt, zone), games: [g] });
  }

  if (!shown.length) return <p className="border-y border-line py-3 text-sm text-muted">No games on this week&apos;s slate yet.</p>;

  return (
    <div>
      {days.map((day) => (
        <section key={day.key} className="mb-5">
          <h2 className="sticky top-[calc(5.75rem+2px+env(safe-area-inset-top))] z-10 -mx-4 mb-2 flex items-baseline gap-2 border-l-4 border-accent bg-surface px-3 py-2 text-base font-bold text-ink sm:top-[calc(3rem+1px+env(safe-area-inset-top))] lg:mx-0 lg:rounded-r-md lg:py-1.5 lg:text-sm">
            <span>{day.label}</span>
            <span className="ml-auto text-xs font-medium text-muted tabular-nums">
              {day.games.length} game{day.games.length === 1 ? "" : "s"}
            </span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 min-[1700px]:grid-cols-4">
            {day.games.map((g) => (
              <li key={g.id}>
                <GameCard g={g} now={now} timezone={timezone} records={records} ats={ats} href={`/p/${slug}/game/${g.id}?week=${week}&from=scoreboard`} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GameCard({ g, now, timezone, records, ats, href }: { g: SlateGame; now: number; timezone: string; records: Record<string, string>; ats: boolean; href: string }) {
  const started = hasStarted(g, now);
  const final = g.status === "final" || g.overridden;
  const live = started && !final && !g.voided && g.status !== "postponed" && g.status !== "cancelled";
  const conf = !g.away.conference || !g.home.conference ? null : g.away.conference === g.home.conference ? g.away.conference : "NC";
  // The favorite and its line, e.g. "HOU −3.5" (home spread is negative when home is favored).
  const line =
    ats && g.spread !== null
      ? g.spread === 0
        ? "PK"
        : g.spread < 0
          ? `${g.home.abbreviation ?? ""} ${formatSpread(g.spread)}`
          : `${g.away.abbreviation ?? ""} ${formatSpread(-g.spread)}`
      : null;
  const awayScore = g.awayScore ?? 0;
  const homeScore = g.homeScore ?? 0;

  const card = (
    <div className={`rounded-lg border border-line bg-surface/60 px-3 py-2 ${g.voided ? "opacity-50" : ""} ${live || final ? "transition hover:bg-hover" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-semibold text-muted">
        {g.voided ? (
          <span className="text-loss">Void</span>
        ) : final ? (
          <span className="text-ink">Final</span>
        ) : live ? (
          <>
            <LiveDot>Live</LiveDot>
            {g.clock && <span className="tabular-nums text-ink">{g.clock}</span>}
          </>
        ) : g.status === "postponed" || g.status === "cancelled" ? (
          <span>{g.status === "postponed" ? "Postponed" : "Cancelled"}</span>
        ) : (
          <span className="tabular-nums">{g.timeTbd ? "TBD" : timeOnly(g.startAt, timezone)}</span>
        )}
        {g.tv && <span className="font-normal">· {g.tv}</span>}
        {conf && <span className="font-normal">· {conf}</span>}
        {g.neutral && <span className="font-normal">· {g.venue ?? "Neutral site"}</span>}
        {line && <span className="font-normal">· {line}</span>}
        {(live || final) && !g.voided && <span className="ml-auto font-semibold text-accent">Box Score ›</span>}
      </div>
      {(["away", "home"] as const).map((side) => {
        const team = side === "home" ? g.home : g.away;
        const rank = side === "home" ? g.homeRank : g.awayRank;
        const score = side === "home" ? g.homeScore : g.awayScore;
        const leads = side === "home" ? homeScore > awayScore : awayScore > homeScore;
        const showScore = started && score !== null;
        return (
          <div key={side} className="mt-1 flex items-center gap-2">
            <TeamLogo src={team.logo_url} abbr={team.abbreviation} className="size-6 shrink-0" />
            <span className={`min-w-0 flex-1 truncate text-[15px] leading-tight ${showScore && !leads ? "text-muted" : "font-semibold text-ink"}`}>
              {rank ? <span className="mr-1 text-xs font-medium tabular-nums text-muted">{rank}</span> : null}
              {team.short_name ?? team.name}
              {team.espn_id && records[team.espn_id] && (
                <span className="ml-1.5 text-xs font-normal tabular-nums text-muted">{records[team.espn_id].replace(/-/g, "–")}</span>
              )}
            </span>
            {live && g.possession === side && <FootballIcon />}
            <span className={`min-w-7 text-right text-[17px] tabular-nums ${showScore && leads ? "font-bold text-ink" : "font-semibold text-muted"}`}>{showScore ? score : ""}</span>
          </div>
        );
      })}
      {live && (g.situation || g.lastPlay) && (
        <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted">
          {g.situation && <span className="font-semibold text-ink">{g.situation}</span>}
          {g.situation && g.lastPlay && " · "}
          {g.lastPlay && <span>{g.lastPlay}</span>}
        </div>
      )}
    </div>
  );

  // Live and final games open the play-by-play and box score.
  return (live || final) && !g.voided ? (
    <Link href={href} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {card}
    </Link>
  ) : (
    card
  );
}

/** The current time, re-rendering every 15 seconds so games go live on time without a reload. */
function useTicking() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
