"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FootballIcon } from "@/components/FootballIcon";
import { LiveDot, TeamLogo, chipClass } from "@/components/ui";
import { useLiveGames } from "@/components/useLiveGames";
import { dayKey, dayLabel, formatSpread, timeOnly } from "@/lib/format";
import { gameDateZone, hasStarted } from "@/lib/locks";
import type { SlateGame } from "@/lib/pool";

/**
 * A day of Division I games as a scoreboard: live games update every 10 seconds (score, clock
 * and period, who has the ball, down and distance, last play), like My Picks, and live or final
 * games open the full play-by-play and box score. Show all, just the pool's games, just games
 * with a Top 25 team (best rank first), or one conference's games. Pool games are marked.
 */
export function Scoreboard({
  day: selectedDay,
  slug,
  week,
  games,
  timezone,
  sport,
  records,
  ats,
  inPool,
}: {
  /** The chosen day (yyyy-mm-dd); only its games show. */
  day: string;
  slug: string;
  week: number;
  games: SlateGame[];
  timezone: string;
  sport: "ncaaf" | "ncaab";
  /** ESPN team id → overall record ("6-0"). */
  records: Record<string, string>;
  /** Against-the-spread pool: show each game's line. */
  ats: boolean;
  /** ESPN ids of the games on the pool's slate. */
  inPool: string[];
}) {
  const now = useTicking();
  // Only the chosen day's games, never a spillover from the next day.
  const all = useLiveGames(games, now, sport).filter((g) => dayKey(g.startAt, gameDateZone(g.timeTbd, timezone)) === selectedDay);
  const [view, setView] = useState<"all" | "pool" | "top25" | "conf">("all");
  const [conf, setConf] = useState("");
  const pool = new Set(inPool);
  const conferences = [...new Set(all.flatMap((g) => [g.home.conference, g.away.conference]).filter((c): c is string => Boolean(c)))].sort();
  const best = (g: SlateGame) => Math.min(g.homeRank ?? 99, g.awayRank ?? 99);
  const inPoolCount = all.filter((g) => g.espnId && pool.has(g.espnId)).length;
  const shown =
    view === "pool"
      ? all.filter((g) => g.espnId && pool.has(g.espnId))
      : view === "top25"
      ? all.filter((g) => best(g) < 99).sort((a, b) => best(a) - best(b) || a.startAt.localeCompare(b.startAt))
      : view === "conf" && conf
        ? all.filter((g) => g.home.conference === conf || g.away.conference === conf)
        : all;

  const days: { key: string; label: string; games: SlateGame[] }[] = [];
  for (const g of shown) {
    const zone = gameDateZone(g.timeTbd, timezone);
    const key = dayKey(g.startAt, zone);
    const day = days.find((d) => d.key === key);
    if (day) day.games.push(g);
    else days.push({ key, label: dayLabel(g.startAt, zone), games: [g] });
  }

  const filters = (
    <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
      <button type="button" onClick={() => setView("all")} aria-pressed={view === "all"} className={chipClass(view === "all", "", "sm")}>
        All <span className="opacity-70 tabular-nums">{all.length}</span>
      </button>
      {/* Just the games on the pool's slate. */}
      <button type="button" onClick={() => setView("pool")} aria-pressed={view === "pool"} className={chipClass(view === "pool", "", "sm")}>
        Pool Games <span className="opacity-70 tabular-nums">{inPoolCount}</span>
      </button>
      <button type="button" onClick={() => setView("top25")} aria-pressed={view === "top25"} className={chipClass(view === "top25", "", "sm")}>
        Top 25
      </button>
      <select
        value={view === "conf" ? conf : ""}
        onChange={(e) => {
          setConf(e.target.value);
          setView(e.target.value ? "conf" : "all");
        }}
        aria-label="Conference"
        className={`${chipClass(view === "conf", "", "sm")} appearance-none pr-6`}
        style={{ backgroundImage: "linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%)", backgroundPosition: "right 10px center, right 6px center", backgroundSize: "4px 4px", backgroundRepeat: "no-repeat" }}
      >
        <option value="">Conference</option>
        {conferences.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );

  if (!shown.length) {
    return (
      <>
        {filters}
        <p className="border-y border-line py-3 text-sm text-muted">
          {all.length
            ? view === "pool"
              ? "No pool games this day."
              : view === "top25"
                ? "No Top 25 teams play this day."
                : "No games for that conference this day."
            : "No Division I games this day."}
        </p>
      </>
    );
  }

  return (
    <div>
      {filters}
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
                <GameCard
                  g={g}
                  now={now}
                  timezone={timezone}
                  records={records}
                  ats={ats}
                  inPool={Boolean(g.espnId && pool.has(g.espnId))}
                  href={`/p/${slug}/game/${g.espnId ?? g.id}?week=${week}&from=scoreboard`}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function GameCard({
  g,
  now,
  timezone,
  records,
  ats,
  inPool,
  href,
}: {
  g: SlateGame;
  now: number;
  timezone: string;
  records: Record<string, string>;
  ats: boolean;
  inPool: boolean;
  href: string;
}) {
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
        {inPool && <span className="rounded-full bg-accent/15 px-1.5 py-px text-[10px] font-semibold text-accent">Pool</span>}
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
