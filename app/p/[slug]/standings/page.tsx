import type { Metadata } from "next";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LazySplitTable } from "@/components/LazySplitTable";
import { LiveTicker } from "@/components/LiveTicker";
import { OptionSwitcher, type SwitchOption } from "@/components/OptionSwitcher";
import { SeasonHeaderRow, SeasonStandings, type WeekScore } from "@/components/SeasonStandings";
import { MobileTabs, StandingsTabs, TabPanel } from "@/components/StandingsTabs";
import { Empty, PageTitle } from "@/components/ui";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getPublishedSlates, getSlateGames } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { segmentForWeek, segmentRanges, segmentWeeksLabel } from "@/lib/poolSettings";
import { SPLITS, type Split } from "@/lib/splits";
import { getStandingsBook } from "@/lib/standings";

export const metadata: Metadata = { title: "Standings" };

/**
 * Three columns, each built once: Season (with a pick-type filter), a week's standings and
 * a bonus segment's. Desktop shows all three; phones show one behind instant tabs. Every week
 * and segment is tallied in memory from one load of the scores, so their buttons switch
 * instantly (OptionSwitcher); the pick-type breakdowns load the first time a filter is tapped
 * (LazySplitTable), since they read every graded pick. ?split=, ?week= and ?segment= pick
 * the starting views.
 */
export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const { week: weekParam, segment: segmentParam, split: splitParam } = await searchParams;
  const split: Split = SPLITS.find((x) => x.id === splitParam)?.id ?? "all";
  const ctx = await getPoolContext(slug);
  // Both come from one cached query of the published weeks (newest first).
  const [slates, current] = await Promise.all([getPublishedSlates(ctx), getCurrentSlate(ctx)]);

  const latestWeek = slates[0]?.week;
  // Segments that have begun; all of them before any week is out.
  const allSegments = segmentRanges(ctx.settings);
  const segments = latestWeek ? allSegments.filter((r) => r.first_week <= latestWeek) : allSegments;
  const currentSegment = current ? segmentForWeek(ctx.settings, current.week) : null;
  const currentSegmentNumber = currentSegment ? segments.findIndex((r) => r.first_week === currentSegment.first_week) + 1 : 0;

  // Starting views: what the address asks for, else the current week and segment.
  const askedWeek = typeof weekParam === "string" ? slates.find((s) => s.week === Number(weekParam)) ?? null : null;
  const askedSegmentNumber = typeof segmentParam === "string" ? Number(segmentParam) : 0;
  const askedSegment = askedSegmentNumber ? segments[askedSegmentNumber - 1] ?? null : null;
  const defaultWeek = current?.week ?? latestWeek ?? 0;
  const startWeek = askedWeek?.week ?? defaultWeek;
  const defaultSegmentNumber = Math.max(1, currentSegmentNumber);
  const startSegment = askedSegment ? askedSegmentNumber : defaultSegmentNumber;
  // Phones lead with the week if one was asked for, else the segment, else the season.
  const startTab = askedWeek ? "weekly" : askedSegment ? "segment" : "season";

  const flat = !ctx.settings.confidence;
  const [book, games, picks] = await Promise.all([
    getStandingsBook(ctx),
    current ? getSlateGames(ctx, current.id) : [],
    // RLS returns other players' picks once their games kick off; possible points treat
    // hidden ones as unused slots, which comes out the same.
    current
      ? ctx.supabase.from("picks").select("user_id, game_id, confidence, result").eq("slate_id", current.id).then(({ data }) => data ?? [])
      : [],
  ]);
  const seasonRows = book.season();

  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live or open
  const now = Date.now();
  const anyLive = games.some(
    (g) => !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled",
  );

  // On tablets the Season table also shows this week's points/possible (as on the Grid) and
  // the current bonus record; desktop has whole columns for those (SeasonStandings hides them).
  let weekColumn: { label: string; scores: Map<string, WeekScore> } | null = null;
  if (current) {
    const openGameIds = games.filter((g) => !g.voided && current.status === "open" && !isGameLocked(g, now)).map((g) => g.id);
    const slotValues = slotValuesFor(ctx.settings);
    weekColumn = {
      label: current.label ?? `Wk ${current.week}`,
      scores: new Map(
        book.week(current.id).map((r) => [
          r.userId,
          {
            points: r.points,
            possible: possiblePoints({ points: r.points, picks: picks.filter((p) => p.user_id === r.userId), openGameIds, slotValues }),
          },
        ]),
      ),
    };
  }
  const bonusColumn = currentSegment
    ? {
        label: currentSegmentNumber > 0 ? `Bonus ${currentSegmentNumber}` : "Bonus",
        records: new Map(
          book.range(currentSegment.first_week, currentSegment.last_week).map((r) => [r.userId, { wins: r.wins, losses: r.losses, pushes: r.pushes }]),
        ),
      }
    : null;

  // The viewer's entry (a co-manager's is the owner's) is the highlighted row.
  const me = ctx.entryUserId;
  const playerHref = (userId: string) => `/p/${slug}/standings/${userId}`;
  const weekLabel = (s: { week: number; label: string | null }) => s.label ?? `Week ${s.week}`;
  const plainHeader = <SeasonHeaderRow flat={flat} week={null} bonus={null} />;
  const each = <T,>(ids: string[], make: (id: string) => T) => Object.fromEntries(ids.map((id) => [id, make(id)])) as Record<string, T>;

  // ---------- Season: All is ready now; the other pick types load on first tap ----------
  const splitOptions: SwitchOption[] = SPLITS.map((x) => ({ id: x.id, label: x.label }));
  const splitIds = SPLITS.map((x) => x.id as string);
  const seasonViews = each(splitIds, (id) =>
    id === "all" ? (
      <SeasonStandings rows={seasonRows} me={me} flat={flat} week={weekColumn} bonus={bonusColumn} playerHref={playerHref} compact header={false} />
    ) : (
      <LazySplitTable slug={slug} split={id as Exclude<Split, "all">} me={me} flat={flat} />
    ),
  );
  const seasonHeaders = each(splitIds, (id) => (id === "all" ? <SeasonHeaderRow flat={flat} week={weekColumn} bonus={bonusColumn} /> : plainHeader));
  const seasonTitles = each(splitIds, (id) => (
    <>
      Season
      {id !== "all" && <span className="font-normal normal-case tracking-normal">&nbsp;· {SPLITS.find((x) => x.id === id)!.label} picks</span>}
    </>
  ));

  // ---------- Weeks: one view per published week, newest first ----------
  const weekOptions: SwitchOption[] = slates.map((s) => ({ id: String(s.week), label: weekLabel(s) }));
  const weekIds = weekOptions.map((o) => o.id);
  const slateByWeek = new Map<string, { id: string; week: number; label: string | null }>(slates.map((s) => [String(s.week), s]));
  const weekViews = each(weekIds, (id) => (
    <SeasonStandings rows={book.week(slateByWeek.get(id)!.id)} me={me} flat={flat} week={null} bonus={null} playerHref={playerHref} compact weekly header={false} />
  ));

  // ---------- Bonus segments: one view per segment that has begun ----------
  const segmentOptions: SwitchOption[] = segments.map((r, i) => ({
    id: String(i + 1),
    label: r.name,
    chip: (
      <>
        {r.name} <span className="opacity-70">· {segmentWeeksLabel(r)}</span>
      </>
    ),
  }));
  const segmentIds = segmentOptions.map((o) => o.id);
  const segmentViews = each(segmentIds, (id) => {
    const r = segments[Number(id) - 1];
    return <SeasonStandings rows={book.range(r.first_week, r.last_week)} me={me} flat={flat} week={null} bonus={null} playerHref={playerHref} compact header={false} />;
  });

  return (
    // data-wide: full screen width on desktop.
    <div data-wide>
      {/* Title on the left; the week's scores fill the space to its right (below it on phones). */}
      <div className="sm:flex sm:items-start sm:gap-6">
        <div className="shrink-0">
          <PageTitle>Standings</PageTitle>
        </div>
        {games.length > 0 && <LiveTicker games={games} now={now} timezone={ctx.displayTz} className="-mt-2 mb-4 sm:mt-1.5 sm:mb-0 sm:flex-1" />}
      </div>
      <AutoRefresh active={anyLive} />

      {!slates.length ? (
        <Empty>Standings appear once the first week is published.</Empty>
      ) : (
        <StandingsTabs initial={startTab} hasSegments={segments.length > 0}>
          <div className="lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
            <TabPanel id="season" label="Season standings">
              <OptionSwitcher
                options={splitOptions}
                initial={split}
                param="split"
                defaultId="all"
                views={seasonViews}
                headers={seasonHeaders}
                titles={seasonTitles}
                lead={<MobileTabs />}
                ariaLabel="Filter season records by pick type"
              />
            </TabPanel>
            <TabPanel id="weekly" label="Week standings">
              <OptionSwitcher
                options={weekOptions}
                initial={String(startWeek)}
                param="week"
                defaultId={String(defaultWeek)}
                views={weekViews}
                headers={each(weekIds, () => plainHeader)}
                titles={each(weekIds, (id) => <>{weekLabel(slateByWeek.get(id)!)} standings</>)}
                lead={<MobileTabs />}
                ariaLabel="Choose a week"
              />
            </TabPanel>
            {segments.length > 0 && (
              <TabPanel id="segment" label="Bonus segment standings">
                <OptionSwitcher
                  options={segmentOptions}
                  initial={String(startSegment)}
                  param="segment"
                  defaultId={String(defaultSegmentNumber)}
                  views={segmentViews}
                  headers={each(segmentIds, () => plainHeader)}
                  titles={each(segmentIds, (id) => (
                    <>
                      Bonus segment <span className="font-normal normal-case tracking-normal">· {segments[Number(id) - 1].name}</span>
                    </>
                  ))}
                  lead={<MobileTabs />}
                  ariaLabel="Choose a bonus segment"
                />
              </TabPanel>
            )}
          </div>
        </StandingsTabs>
      )}
    </div>
  );
}
