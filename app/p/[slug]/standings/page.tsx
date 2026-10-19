import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveTicker } from "@/components/LiveTicker";
import { SeasonStandings, type WeekScore } from "@/components/SeasonStandings";
import { chipClass, Empty, PageTitle, SectionLabel } from "@/components/ui";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { segmentForWeek, segmentRanges, segmentWeeksLabel } from "@/lib/poolSettings";
import { SPLITS, type Split } from "@/lib/splits";
import { getSplitStandings } from "@/lib/splitsData";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Standings" };

/**
 * Desktop: three columns. Season standings (rank, name, record, win %) on the left, a
 * week's standings in the middle and a bonus segment's on the right, each with its own
 * picker. Phones: one table at a time behind Season / Bonus Segments / Weekly tabs. Both
 * read ?week= and ?segment=.
 */
export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const { week: weekParam, segment: segmentParam, split: splitParam } = await searchParams;
  // The season table's pick-type filter: All, Favorites, Underdogs, Home, Away.
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

  // What the URL asks for; the panels fall back to the current week and segment.
  const askedWeek = typeof weekParam === "string" ? slates?.find((s) => s.week === Number(weekParam)) ?? null : null;
  const askedSegmentNumber = typeof segmentParam === "string" ? Number(segmentParam) : 0;
  const askedSegment = askedSegmentNumber ? segments[askedSegmentNumber - 1] ?? null : null;
  const panelSlate = askedWeek ?? (current ? slates?.find((s) => s.id === current.id) ?? null : null);
  const panelSegmentNumber = askedSegment ? askedSegmentNumber : Math.max(1, currentSegmentNumber);
  const panelSegment = segments[panelSegmentNumber - 1] ?? null;
  // Phones show one table: the week if one was asked for, else the segment, else the season.
  const view = askedWeek ? "weekly" : askedSegment ? "segment" : "season";

  const flat = !ctx.settings.confidence;
  const [seasonRows, weekRows, segmentRows, games, currentWeekRows, currentSegmentRows, picks] = await Promise.all([
    split === "all" ? getStandings(ctx) : getSplitStandings(ctx, split),
    panelSlate ? getStandings(ctx, panelSlate.id) : null,
    panelSegment ? getStandings(ctx, { fromWeek: panelSegment.first_week, toWeek: panelSegment.last_week }) : null,
    current ? getSlateGames(ctx, current.id) : [],
    current ? getStandings(ctx, current.id) : null,
    currentSegment ? getStandings(ctx, { fromWeek: currentSegment.first_week, toWeek: currentSegment.last_week }) : null,
    // RLS returns other players' picks once their games kick off; possible points treat
    // hidden ones as unused slots, which comes out the same.
    current
      ? ctx.supabase.from("picks").select("user_id, game_id, confidence, result").eq("slate_id", current.id).then(({ data }) => data ?? [])
      : [],
  ]);

  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are live or open
  const now = Date.now();
  const anyLive = games.some(
    (g) => !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled",
  );

  // Season table: this week's points/possible (as on the Grid) and the current bonus record.
  let weekColumn: { label: string; scores: Map<string, WeekScore> } | null = null;
  if (current && currentWeekRows) {
    const openGameIds = games.filter((g) => !g.voided && current.status === "open" && !isGameLocked(g, now)).map((g) => g.id);
    const slotValues = slotValuesFor(ctx.settings);
    weekColumn = {
      label: current.label ?? `Wk ${current.week}`,
      scores: new Map(
        currentWeekRows.map((r) => [
          r.userId,
          {
            points: r.points,
            possible: possiblePoints({ points: r.points, picks: picks.filter((p) => p.user_id === r.userId), openGameIds, slotValues }),
          },
        ]),
      ),
    };
  }
  const bonusColumn =
    currentSegment && currentSegmentRows
      ? {
          label: currentSegmentNumber > 0 ? `Bonus ${currentSegmentNumber}` : "Bonus",
          records: new Map(currentSegmentRows.map((r) => [r.userId, { wins: r.wins, losses: r.losses, pushes: r.pushes }])),
        }
      : null;

  // Links keep the other panel's choice.
  const href = (week: number | null, segment: number | null, splitTo: Split = split) => {
    const q = new URLSearchParams();
    if (splitTo !== "all") q.set("split", splitTo);
    if (week) q.set("week", String(week));
    if (segment) q.set("segment", String(segment));
    const s = q.toString();
    return `/p/${slug}/standings${s ? `?${s}` : ""}`;
  };
  const keepSegment = askedSegment ? askedSegmentNumber : null;
  const keepWeek = askedWeek ? askedWeek.week : null;
  const splitLabel = SPLITS.find((x) => x.id === split)!.label;
  const splitChips = (
    <div className="-mx-4 mb-1 flex gap-1 overflow-x-auto px-4 py-1" aria-label="Filter season records by pick type">
      {SPLITS.map((x) => (
        <Link key={x.id} href={href(keepWeek, keepSegment, x.id)} aria-current={x.id === split ? "true" : undefined} className={chipClass(x.id === split, "", "xs")}>
          {x.label}
        </Link>
      ))}
    </div>
  );
  const playerHref = (userId: string) => `/p/${slug}/standings/${userId}`;
  const weekLabel = (s: { week: number; label: string | null }) => s.label ?? `Week ${s.week}`;

  const weekChips = (
    <div className="-mx-4 mb-1 flex gap-1 overflow-x-auto px-4 py-1">
      {slates?.map((s) => (
        <Link key={s.id} href={href(s.week, keepSegment)} aria-current={s.id === panelSlate?.id ? "page" : undefined} className={chipClass(s.id === panelSlate?.id, "", "xs")}>
          {weekLabel(s)}
        </Link>
      ))}
    </div>
  );
  const segmentChips = (
    <div className="-mx-4 mb-1 flex gap-1 overflow-x-auto px-4 py-1">
      {segments.map((r, i) => (
        <Link
          key={r.first_week}
          href={href(keepWeek, i + 1)}
          aria-current={r === panelSegment ? "page" : undefined}
          className={chipClass(r === panelSegment, "", "xs")}
        >
          {r.name} <span className={r === panelSegment ? "opacity-70" : "text-muted"}>· {segmentWeeksLabel(r)}</span>
        </Link>
      ))}
    </div>
  );

  // A small segmented control (phones): compact tabs sized to their labels.
  const tab = (active: boolean) =>
    `flex h-8 items-center justify-center rounded-full px-3.5 text-xs font-medium transition ${active ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;

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
          {/* ---------- Desktop: season | week | bonus segment, all in the same table format
                (Player · Record · Win %, then the pool total) ---------- */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:items-start lg:gap-8">
            <section aria-labelledby="season-standings">
              <SectionLabel className="flex min-h-9 items-center">
                <span id="season-standings">
                  Season
                  {split !== "all" && <span className="font-normal normal-case tracking-normal"> · {splitLabel} picks</span>}
                </span>
              </SectionLabel>
              {/* The pick-type filter sits where the other columns have their pickers. */}
              {splitChips}
              <SeasonStandings rows={seasonRows} me={ctx.user.id} flat={flat} week={null} bonus={null} playerHref={playerHref} compact />
            </section>
            <>
              {panelSlate && weekRows && (
                <section aria-labelledby="week-standings">
                  <SectionLabel className="flex min-h-9 items-center">
                    <span id="week-standings">{weekLabel(panelSlate)} standings</span>
                  </SectionLabel>
                  {weekChips}
                  <SeasonStandings rows={weekRows} me={ctx.user.id} flat={flat} week={null} bonus={null} playerHref={playerHref} compact weekly />
                </section>
              )}
              {panelSegment && segmentRows && (
                <section aria-labelledby="segment-standings">
                  <SectionLabel className="flex min-h-9 items-center">
                    <span id="segment-standings">
                      Bonus segment <span className="font-normal normal-case tracking-normal">· {panelSegment.name}</span>
                    </span>
                  </SectionLabel>
                  {segmentChips}
                  <SeasonStandings rows={segmentRows} me={ctx.user.id} flat={flat} week={null} bonus={null} playerHref={playerHref} compact />
                </section>
              )}
            </>
          </div>

          {/* ---------- Phones and tablets: one table at a time ---------- */}
          <div className="lg:hidden">
            <div className="mb-4 inline-flex rounded-full bg-surface p-0.5">
              <Link href={`/p/${slug}/standings`} aria-current={view === "season" ? "page" : undefined} className={tab(view === "season")}>Season</Link>
              {segments.length > 0 && (
                <Link href={href(null, panelSegmentNumber)} aria-current={view === "segment" ? "page" : undefined} className={tab(view === "segment")}>
                  Bonus Segments
                </Link>
              )}
              <Link href={href(latestWeek ?? 1, null)} aria-current={view === "weekly" ? "page" : undefined} className={tab(view === "weekly")}>Weekly</Link>
            </div>
            {view === "segment" && segmentChips}
            {view === "weekly" && weekChips}
            {view === "season" && splitChips}
            {view === "season" ? (
              <SeasonStandings
                rows={seasonRows}
                me={ctx.user.id}
                flat={flat}
                // This week's and the bonus columns are about all picks; a filtered table drops them.
                week={split === "all" ? weekColumn : null}
                bonus={split === "all" ? bonusColumn : null}
                playerHref={playerHref}
              />
            ) : view === "weekly" && weekRows ? (
              <SeasonStandings rows={weekRows} me={ctx.user.id} flat={flat} week={null} bonus={null} playerHref={playerHref} weekly />
            ) : segmentRows ? (
              <SeasonStandings rows={segmentRows} me={ctx.user.id} flat={flat} week={null} bonus={null} playerHref={playerHref} />
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
