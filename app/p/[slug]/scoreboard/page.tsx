import type { Metadata } from "next";
import Link from "next/link";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageTitle, chipClass } from "@/components/ui";
import { getEspnDay } from "@/lib/espnScoreboard";
import { dayKey, windowLabel } from "@/lib/format";
import { isLive, withLiveClocks } from "@/lib/liveClock";
import { gameDateZone } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getPublishedSlates, getSlateGames, type SlateGame } from "@/lib/pool";
import { Scoreboard } from "./Scoreboard";

export const metadata: Metadata = { title: "Scoreboard" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const plusDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

/**
 * Every Division I game, one day at a time, across the pool's week (the current week unless
 * ?week=; today unless ?day=yyyy-mm-dd). Live like My Picks; games on the pool's slate are marked.
 */
export default async function ScoreboardPage({ params, searchParams }: PageProps<"/p/[slug]/scoreboard">) {
  const { slug } = await params;
  const { week: weekParam, day: dayParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const tz = ctx.displayTz;
  const [slates, current] = await Promise.all([getPublishedSlates(ctx), getCurrentSlate(ctx)]);
  const slate = typeof weekParam === "string" ? slates.find((s) => s.week === Number(weekParam)) ?? current : current;

  // The week's days in the viewer's time zone (the slate's window, or this Monday–Sunday).
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of today and live games
  const now = Date.now();
  const today = formatInTimeZone(now, tz, "yyyy-MM-dd");
  const first = slate ? formatInTimeZone(slate.window_start, tz, "yyyy-MM-dd") : today;
  const last = slate ? formatInTimeZone(new Date(new Date(slate.window_end).getTime() - 1), tz, "yyyy-MM-dd") : plusDays(today, 6);
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 14; d = plusDays(d, 1)) days.push(d);
  const day = typeof dayParam === "string" && ISO_DATE.test(dayParam) && days.includes(dayParam) ? dayParam : days.includes(today) ? today : days[0];

  // ESPN counts days in Eastern time, so a late tip here can sit on its next day: read both
  // and keep the games on this local day.
  const sport = ctx.pool.sport === "ncaab" ? "ncaab" : "ncaaf";
  const espn = (d: string) => d.replaceAll("-", "");
  const [a, b, slateGames] = await Promise.all([
    getEspnDay(sport, espn(day), day === today),
    getEspnDay(sport, espn(plusDays(day, 1)), day === today),
    slate ? getSlateGames(ctx, slate.id) : Promise.resolve([]),
  ]);
  const seen = new Set<string>();
  const dayGames = [...a, ...b].filter((g) => {
    // Same day rule the cards use (a TBD time counts in Eastern), so nothing from the next day slips in.
    if (seen.has(g.id) || dayKey(g.startAt, gameDateZone(g.timeTbd, tz)) !== day) return false;
    seen.add(g.id);
    return true;
  });
  // The pool's lines (football) and which games are on the slate.
  const slateByEspn = new Map<string, SlateGame>(slateGames.filter((g) => g.espnId).map((g) => [g.espnId!, g]));
  const withLines = dayGames.map((g) => ({ ...g, spread: slateByEspn.get(g.espnId ?? "")?.spread ?? null }));
  const games = await withLiveClocks(sport, withLines, now);
  const records: Record<string, string> = {};
  for (const g of dayGames) {
    if (g.home.espn_id && g.records.home) records[g.home.espn_id] = g.records.home;
    if (g.away.espn_id && g.records.away) records[g.away.espn_id] = g.records.away;
  }
  const anyLive = games.some((g) => isLive(g, now));
  const week = slate?.week ?? 0;
  const label = (d: string) => formatInTimeZone(fromZonedTime(`${d}T12:00:00`, tz), tz, "EEE M/d");

  return (
    <div data-wide>
      <PageTitle sub={slate ? windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone) : undefined}>
        Scoreboard{slate && <span className="text-muted"> · {slate.label ?? `Week ${slate.week}`}</span>}
      </PageTitle>
      {slates.length > 1 && (
        <div className="-mx-4 mb-1 flex gap-1 overflow-x-auto px-4 py-1.5">
          {[...slates].reverse().map((s) => (
            <Link key={s.id} href={`/p/${slug}/scoreboard?week=${s.week}`} aria-current={s.id === slate?.id ? "page" : undefined} className={chipClass(s.id === slate?.id, "", "sm")}>
              {s.label ?? `Week ${s.week}`}
            </Link>
          ))}
        </div>
      )}
      {/* The week's days; today is the default. */}
      <div className="-mx-4 mb-3 flex gap-1 overflow-x-auto px-4 py-1.5">
        {days.map((d) => (
          <Link
            key={d}
            href={`/p/${slug}/scoreboard?${slate ? `week=${slate.week}&` : ""}day=${d}`}
            aria-current={d === day ? "page" : undefined}
            className={chipClass(d === day, "", "sm")}
          >
            {d === today ? "Today" : label(d)}
          </Link>
        ))}
      </div>
      {/* Finals and tip times come from the server each minute; plays poll faster in the client. */}
      <AutoRefresh active={anyLive} />
      <Scoreboard
        key={day}
        day={day}
        slug={slug}
        week={week}
        games={games}
        timezone={tz}
        sport={sport}
        records={records}
        ats={ctx.settings.pick_type === "ats"}
        inPool={[...slateByEspn.keys()]}
      />
      <p className="mt-4 text-xs text-muted">
        {sport === "ncaab" ? "Every Division I men's game between D-I teams." : "Every FBS game."} Scores and plays from ESPN.
      </p>
    </div>
  );
}
