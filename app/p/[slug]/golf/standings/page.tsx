import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfSeasonHeaderRow, GolfSeasonStandings, GolfWeekHeaderRow, GolfWeekStandings, type WeekRow } from "@/components/GolfStandings";
import { GolfWeekSwitcher } from "@/components/GolfWeekSwitcher";
import { FROZEN_HEAD } from "@/components/SeasonStandings";
import { MobileTabs, StandingsTabs, TabPanel } from "@/components/StandingsTabs";
import { Empty, PageTitle, SectionLabel } from "@/components/ui";
import { getGolfContext } from "@/lib/golf";
import { getGolfStandingsData, type StandingRow } from "@/lib/golfStandings";

export const metadata: Metadata = { title: "Standings" };

/** Competition ranking by a number, best first: 1, 2, 2, 4. */
function ranked<T>(rows: T[], value: (r: T) => number, name: (r: T) => string) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a) || name(a).localeCompare(name(b)));
  const values = sorted.map(value);
  return sorted.map((r) => ({ r, place: values.indexOf(value(r)) + 1, tied: values.filter((v) => v === value(r)).length > 1 }));
}

/**
 * Laid out like the football and basketball Standings: Season and Weekly columns side by side
 * on desktop, one at a time behind tabs on phones. Every week is built up front, so the week
 * buttons switch instantly; ?week= picks the starting week. A player's name opens their season.
 */
export default async function GolfStandingsPage({ params, searchParams }: PageProps<"/p/[slug]/golf/standings">) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;
  const ctx = await getGolfContext(slug);
  // eslint-disable-next-line react-hooks/purity
  const data = await getGolfStandingsData(ctx, Date.now());
  const playerHref = (userId: string) => `/p/${slug}/golf/standings/${userId}`;

  // Weeks to choose from: every event played, plus the current one while it's still open.
  const weeks = [...data.played];
  if (data.current && !weeks.some((w) => w.week === data.current!.week)) weeks.push({ week: data.current.week, name: data.current.name, final: false });
  const weekOptions = weeks.map((w) => ({ id: String(w.week), label: `Week ${w.week} · ${w.name}` }));
  const weekIds = weekOptions.map((o) => o.id);

  const weekRows = (week: number): WeekRow[] => {
    const isCurrent = data.current?.week === week;
    const final = weeks.find((w) => w.week === week)!.final;
    const base = (r: StandingRow) => ({ userId: r.userId, name: r.name, isMe: r.isMe });
    if (final) {
      const logOf = (r: StandingRow) => r.log.find((l) => l.week === week);
      return ranked(data.rows, (r) => logOf(r)?.earned ?? 0, (r) => r.name).map(({ r, place, tied }) => {
        const l = logOf(r);
        return { ...base(r), place, tied, golfer: l?.golfer ?? null, hidden: false, finish: l?.finish ?? "", earned: l?.earned ?? 0 };
      });
    }
    // Under way: by the golfer's live place. Still open: in season order, picks hidden.
    const rows = data.rows.map((r) => ({
      ...base(r),
      place: null,
      tied: false,
      golfer: isCurrent ? (r.thisWeek?.golfer ?? null) : (r.log.find((l) => l.week === week)?.golfer ?? null),
      hidden: isCurrent ? (r.thisWeek?.hidden ?? false) : false,
      finish: isCurrent ? (r.thisWeek?.live ?? "") : "",
      earned: 0,
      liveRank: isCurrent ? (r.thisWeek?.liveRank ?? 99999) : 99999,
    }));
    return rows.sort((a, b) => a.liveRank - b.liveRank);
  };

  // Start on the week asked for; else the event under way; else the last finished one.
  const lastFinal = data.lastFinal ? String(data.lastFinal.week) : null;
  const defaultWeek = data.current?.live ? String(data.current.week) : (lastFinal ?? weekIds[weekIds.length - 1] ?? "");
  const startWeek = typeof weekParam === "string" && weekIds.includes(weekParam) ? weekParam : defaultWeek;
  const each = <T,>(make: (id: string) => T) => Object.fromEntries(weekIds.map((id) => [id, make(id)])) as Record<string, T>;
  const isFinal = (id: string) => weeks.find((w) => String(w.week) === id)!.final;

  return (
    // data-wide: full screen width on desktop.
    <div data-wide>
      <PageTitle>Standings</PageTitle>
      <AutoRefresh active={!!data.current?.live} seconds={120} />

      {data.rows.length === 0 ? (
        <Empty>No standings yet.</Empty>
      ) : (
        <StandingsTabs initial={typeof weekParam === "string" ? "weekly" : "season"} hasSegments={false}>
          <div className="lg:grid lg:grid-cols-2 lg:items-start lg:gap-8">
            <TabPanel id="season" label="Season standings">
              <div className={FROZEN_HEAD}>
                <MobileTabs />
                <SectionLabel className="flex min-h-9 items-center">
                  <span>
                    Season
                    {data.lastFinal && (
                      <span className="font-normal normal-case tracking-normal">
                        &nbsp;· through Week {data.lastFinal.week}
                      </span>
                    )}
                  </span>
                </SectionLabel>
                <GolfSeasonHeaderRow />
              </div>
              <GolfSeasonStandings rows={data.rows} playerHref={playerHref} />
            </TabPanel>

            <TabPanel id="weekly" label="Week standings">
              {weekIds.length === 0 ? (
                <>
                  <div className={FROZEN_HEAD}>
                    <MobileTabs />
                    <SectionLabel className="flex min-h-9 items-center">Weekly Standings</SectionLabel>
                  </div>
                  <p className="border-y border-line py-3 text-sm text-muted">No events yet.</p>
                </>
              ) : (
                <GolfWeekSwitcher
                  weeks={weekOptions}
                  initial={startWeek}
                  defaultId={defaultWeek}
                  views={each((id) => (
                    <GolfWeekStandings rows={weekRows(Number(id))} final={isFinal(id)} playerHref={playerHref} />
                  ))}
                  headers={each((id) => (
                    <GolfWeekHeaderRow final={isFinal(id)} />
                  ))}
                  lead={<MobileTabs />}
                />
              )}
            </TabPanel>
          </div>
        </StandingsTabs>
      )}
    </div>
  );
}
