import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveTicker } from "@/components/LiveTicker";
import { OptionSwitcher, type SwitchOption } from "@/components/OptionSwitcher";
import { SeasonHeaderRow, SeasonStandings, type WeekScore } from "@/components/SeasonStandings";
import { Empty, PageTitle } from "@/components/ui";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { segmentForWeek, segmentRanges, segmentWeeksLabel } from "@/lib/poolSettings";
import { SPLITS, type Split } from "@/lib/splits";
import { getAllSplitStandings } from "@/lib/splitsData";
import { getStandingsBook } from "@/lib/standings";

export const metadata: Metadata = { title: "Standings" };

/**
 * Desktop: three columns. Season standings (with a pick-type filter) on the left, a week's
 * standings in the middle and a bonus segment's on the right. Every week, segment and filter
 * is rendered up front from one load of the scores, so their buttons switch instantly
 * (OptionSwitcher). Phones: one table at a time behind Season / Bonus Segments / Weekly
 * tabs. ?split=, ?week= and ?segment= pick the starting views.
 */
export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const { week: weekParam, segment: segmentParam, split: splitParam } = await searchParams;
  const split: Split = SPLITS.find((x) => x.id === splitParam)?.id ?? "all";
  const ctx = await getPoolContext(slug);
  const { data: slates } = await ctx.supabase
    .from("slates")
    .select("id, week, label, status")
    .eq("pool_id", ctx.pool.id)
    .neq("status", "draft")
    .order("week", { ascending: false });

  const latestWeek = slates?.[0]?.week;
  // Segments that have begun; all of them before any week is out.
  const allSegments = segmentRanges(ctx.settings);
  const segments = latestWeek ? allSegments.filter((r) => r.first_week <= latestWeek) : allSegments;
  const current = await getCurrentSlate(ctx);
  const currentSegment = current ? segmentForWeek(ctx.settings, current.week) : null;
  const currentSegmentNumber = currentSegment ? segments.findIndex((r) => r.first_week === currentSegment.first_week) + 1 : 0;

  // Starting views: what the address asks for, else the current week and segment.
  const askedWeek = typeof weekParam === "string" ? slates?.find((s) => s.week === Number(weekParam)) ?? null : null;
  const askedSegmentNumber = typeof segmentParam === "string" ? Number(segmentParam) : 0;
  const askedSegment = askedSegmentNumber ? segments[askedSegmentNumber - 1] ?? null : null;
  const defaultWeek = current?.week ?? latestWeek ?? 0;
  const startWeek = askedWeek?.week ?? defaultWeek;
  const defaultSegmentNumber = Math.max(1, currentSegmentNumber);
  const startSegment = askedSegment ? askedSegmentNumber : defaultSegmentNumber;
  // Phones show one table: the week if one was asked for, else the segment, else the season.
  const view = askedWeek ? "weekly" : askedSegment ? "segment" : "season";

  const flat = !ctx.settings.confidence;
  const [book, games, picks, splits] = await Promise.all([
    getStandingsBook(ctx),
    current ? getSlateGames(ctx, current.id) : [],
    // RLS returns other players' picks once their games kick off; possible points treat
    // hidden ones as unused slots, which comes out the same.
    current
      ? ctx.supabase.from("picks").select("user_id, game_id, confidence, result").eq("slate_id", current.id).then(({ data }) => data ?? [])
      : [],
    // Every pick-type breakdown. A failure only costs the filter (logged), never the page.
    getAllSplitStandings(ctx).catch((err) => {
      console.error("Standings: pick-type breakdown failed", err);
      return null;
    }),
  ]);
  const seasonRows = book.season();

  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live or open
  const now = Date.now();
  const anyLive = games.some(
    (g) => !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled",
  );

  // Phones' Season table also shows this week's points/possible (as on the Grid) and the
  // current bonus record; desktop has whole columns for those.
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

  const me = ctx.user.id;
  const playerHref = (userId: string) => `/p/${slug}/standings/${userId}`;
  const weekLabel = (s: { week: number; label: string | null }) => s.label ?? `Week ${s.week}`;
  const plainHeader = <SeasonHeaderRow flat={flat} week={null} bonus={null} />;
  const each = <T,>(ids: string[], make: (id: string) => T) => Object.fromEntries(ids.map((id) => [id, make(id)])) as Record<string, T>;

  // ---------- Season: one view per pick type ----------
  const splitOptions: SwitchOption[] = SPLITS.map((x) => ({ id: x.id, label: x.label }));
  const splitIds = SPLITS.map((x) => x.id as string);
  const seasonView = (id: string, compact: boolean): ReactNode =>
    id === "all" ? (
      <SeasonStandings
        rows={seasonRows}
        me={me}
        flat={flat}
        week={compact ? null : weekColumn}
        bonus={compact ? null : bonusColumn}
        playerHref={playerHref}
        compact={compact}
        header={false}
      />
    ) : splits ? (
      <SeasonStandings rows={splits[id as Exclude<Split, "all">]} me={me} flat={flat} week={null} bonus={null} playerHref={playerHref} compact={compact} header={false} />
    ) : (
      <p className="border-y border-line py-3 text-sm text-muted">This breakdown couldn&apos;t load right now. Try again in a minute.</p>
    );
  const seasonHeader = (id: string, compact: boolean): ReactNode =>
    id === "all" ? <SeasonHeaderRow flat={flat} week={compact ? null : weekColumn} bonus={compact ? null : bonusColumn} /> : splits ? plainHeader : null;
  const seasonTitle = (id: string) => (
    <>
      Season
      {id !== "all" && <span className="font-normal normal-case tracking-normal">&nbsp;· {SPLITS.find((x) => x.id === id)!.label} picks</span>}
    </>
  );

  // ---------- Weeks: one view per published week, newest first ----------
  const weekOptions: SwitchOption[] = (slates ?? []).map((s) => ({ id: String(s.week), label: weekLabel(s) }));
  const weekIds = weekOptions.map((o) => o.id);
  const slateByWeek = new Map<string, { id: string; week: number; label: string | null }>((slates ?? []).map((s) => [String(s.week), s]));
  const weekView = (id: string, compact: boolean): ReactNode => (
    <SeasonStandings rows={book.week(slateByWeek.get(id)!.id)} me={me} flat={flat} week={null} bonus={null} playerHref={playerHref} compact={compact} weekly header={false} />
  );

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
  const segmentView = (id: string, compact: boolean): ReactNode => {
    const r = segments[Number(id) - 1];
    return <SeasonStandings rows={book.range(r.first_week, r.last_week)} me={me} flat={flat} week={null} bonus={null} playerHref={playerHref} compact={compact} header={false} />;
  };

  // Phone tabs are links (they change which table the page leads with); the buttons under
  // them switch instantly like on desktop.
  const tabHref = (q: string) => `/p/${slug}/standings${q}`;
  const tab = (active: boolean) =>
    `flex h-8 items-center justify-center rounded-full px-3.5 text-xs font-medium transition ${active ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;
  const phoneTabs = (
    <div className="mb-3 mt-1 inline-flex rounded-full bg-surface p-0.5">
      <Link href={tabHref("")} aria-current={view === "season" ? "page" : undefined} className={tab(view === "season")}>Season</Link>
      {segments.length > 0 && (
        <Link href={tabHref(`?segment=${startSegment}`)} aria-current={view === "segment" ? "page" : undefined} className={tab(view === "segment")}>
          Bonus Segments
        </Link>
      )}
      <Link href={tabHref(`?week=${startWeek}`)} aria-current={view === "weekly" ? "page" : undefined} className={tab(view === "weekly")}>Weekly</Link>
    </div>
  );

  return (
    // data-wide: full screen width on desktop.
    <div data-wide>
      {/* Title on the left; the week's scores fill the space to its right (below it on phones). */}
      <div className="sm:flex sm:items-start sm:gap-6">
        <div className="shrink-0">
          <PageTitle>Standings</PageTitle>
        </div>
        {games.length > 0 && <LiveTicker games={games} now={now} timezone={ctx.settings.timezone} className="-mt-2 mb-4 sm:mt-1.5 sm:mb-0 sm:flex-1" />}
      </div>
      <AutoRefresh active={anyLive} />

      {!slates?.length ? (
        <Empty>Standings appear once the first week is published.</Empty>
      ) : (
        <>
          {/* ---------- Desktop: season | week | bonus segment, all in the same table format ---------- */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
            <section aria-label="Season standings">
              <OptionSwitcher
                options={splitOptions}
                initial={split}
                param="split"
                defaultId="all"
                views={each(splitIds, (id) => seasonView(id, true))}
                headers={each(splitIds, (id) => seasonHeader(id, true))}
                titles={each(splitIds, seasonTitle)}
                ariaLabel="Filter season records by pick type"
              />
            </section>
            <section aria-label="Week standings">
              <OptionSwitcher
                options={weekOptions}
                initial={String(startWeek)}
                param="week"
                defaultId={String(defaultWeek)}
                views={each(weekIds, (id) => weekView(id, true))}
                headers={each(weekIds, () => plainHeader)}
                titles={each(weekIds, (id) => <>{weekLabel(slateByWeek.get(id)!)} standings</>)}
                ariaLabel="Choose a week"
              />
            </section>
            {segments.length > 0 && (
              <section aria-label="Bonus segment standings">
                <OptionSwitcher
                  options={segmentOptions}
                  initial={String(startSegment)}
                  param="segment"
                  defaultId={String(defaultSegmentNumber)}
                  views={each(segmentIds, (id) => segmentView(id, true))}
                  headers={each(segmentIds, () => plainHeader)}
                  titles={each(segmentIds, (id) => (
                    <>
                      Bonus segment <span className="font-normal normal-case tracking-normal">· {segments[Number(id) - 1].name}</span>
                    </>
                  ))}
                  ariaLabel="Choose a bonus segment"
                />
              </section>
            )}
          </div>

          {/* ---------- Phones and tablets: one table at a time; tabs freeze with its buttons ---------- */}
          <div className="lg:hidden">
            {view === "season" ? (
              <OptionSwitcher
                options={splitOptions}
                initial={split}
                param="split"
                defaultId="all"
                views={each(splitIds, (id) => seasonView(id, false))}
                headers={each(splitIds, (id) => seasonHeader(id, false))}
                lead={phoneTabs}
                ariaLabel="Filter season records by pick type"
              />
            ) : view === "weekly" ? (
              <OptionSwitcher
                options={weekOptions}
                initial={String(startWeek)}
                param="week"
                defaultId="__none" // phones keep ?week= so the Weekly tab stays open
                views={each(weekIds, (id) => weekView(id, false))}
                headers={each(weekIds, () => plainHeader)}
                lead={phoneTabs}
                ariaLabel="Choose a week"
              />
            ) : (
              <OptionSwitcher
                options={segmentOptions}
                initial={String(startSegment)}
                param="segment"
                defaultId="__none" // phones keep ?segment= so the Bonus Segments tab stays open
                views={each(segmentIds, (id) => segmentView(id, false))}
                headers={each(segmentIds, () => plainHeader)}
                lead={phoneTabs}
                ariaLabel="Choose a bonus segment"
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
