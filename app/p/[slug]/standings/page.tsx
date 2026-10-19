import type { Metadata } from "next";
import Link from "next/link";
import { SeasonStandings, type WeekScore } from "@/components/SeasonStandings";
import { StandingsTable } from "@/components/StandingsTable";
import { chipClass, Empty, PageTitle } from "@/components/ui";
import { isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { segmentForWeek, segmentRanges, segmentWeeksLabel } from "@/lib/poolSettings";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Standings" };

export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const { week: weekParam, segment: segmentParam } = await searchParams;
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
  const currentSegment = latestWeek ? segmentForWeek(ctx.settings, latestWeek) : null;
  const defaultSegment = Math.max(1, currentSegment ? segments.findIndex((r) => r.first_week === currentSegment.first_week) + 1 : 1);

  const week = typeof weekParam === "string" ? Number(weekParam) : null;
  const slate = week ? slates?.find((s) => s.week === week) : null;
  const segmentIndex = !slate && typeof segmentParam === "string" ? Number(segmentParam) : null;
  const segment = segmentIndex ? segments[segmentIndex - 1] ?? null : null;
  const rows = await getStandings(ctx, slate?.id ?? (segment ? { fromWeek: segment.first_week, toWeek: segment.last_week } : undefined));
  const view = slate ? "weekly" : segment ? "segment" : "season";

  // Season view: each player's points/possible this week (as on the Grid) and their record
  // in the current bonus segment, beside their season numbers.
  let week: { label: string; scores: Map<string, WeekScore> } | null = null;
  let bonus: { label: string; records: Map<string, { wins: number; losses: number; pushes: number }> } | null = null;
  if (view === "season") {
    const current = await getCurrentSlate(ctx);
    const seg = current ? segmentForWeek(ctx.settings, current.week) : null;
    const segNumber = seg ? segments.findIndex((r) => r.first_week === seg.first_week) + 1 : 0;
    const [weekRows, segRows, games, picks] = await Promise.all([
      current ? getStandings(ctx, current.id) : null,
      seg ? getStandings(ctx, { fromWeek: seg.first_week, toWeek: seg.last_week }) : null,
      current ? getSlateGames(ctx, current.id) : [],
      // RLS returns other players' picks once their games kick off; possible points treat
      // hidden ones as unused slots, which comes out the same.
      current
        ? ctx.supabase.from("picks").select("user_id, game_id, confidence, result").eq("slate_id", current.id).then(({ data }) => data ?? [])
        : [],
    ]);
    if (current && weekRows) {
      // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which games are still open
      const now = Date.now();
      const openGameIds = games.filter((g) => !g.voided && current.status === "open" && !isGameLocked(g, now)).map((g) => g.id);
      const slotValues = slotValuesFor(ctx.settings);
      week = {
        label: current.label ?? `Wk ${current.week}`,
        scores: new Map(
          weekRows.map((r) => [
            r.userId,
            {
              points: r.points,
              possible: possiblePoints({ points: r.points, picks: picks.filter((p) => p.user_id === r.userId), openGameIds, slotValues }),
            },
          ]),
        ),
      };
    }
    if (seg && segRows) {
      bonus = {
        label: segNumber > 0 ? `Bonus ${segNumber}` : "Bonus",
        records: new Map(segRows.map((r) => [r.userId, { wins: r.wins, losses: r.losses, pushes: r.pushes }])),
      };
    }
  }

  // A small segmented control: compact tabs sized to their labels.
  const tab = (active: boolean) =>
    `flex h-8 items-center justify-center rounded-full px-3.5 text-xs font-medium transition ${active ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;

  return (
    // data-wide: full screen width on desktop.
    <div data-wide>
      <PageTitle>Standings</PageTitle>
      <div className="mb-4 inline-flex rounded-full bg-surface p-0.5">
        <Link href={`/p/${slug}/standings`} aria-current={view === "season" ? "page" : undefined} className={tab(view === "season")}>Season</Link>
        {segments.length > 0 && (
          <Link
            href={`/p/${slug}/standings?segment=${defaultSegment}`}
            aria-current={view === "segment" ? "page" : undefined}
            className={tab(view === "segment")}
          >
            Bonus Segments
          </Link>
        )}
        <Link href={`/p/${slug}/standings?week=${latestWeek ?? 1}`} aria-current={view === "weekly" ? "page" : undefined} className={tab(view === "weekly")}>Weekly</Link>
      </div>
      {segment && (
        <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {segments.map((r, i) => (
            <Link
              key={r.first_week}
              href={`/p/${slug}/standings?segment=${i + 1}`}
              aria-current={r === segment ? "page" : undefined}
              className={chipClass(r === segment, "min-h-11")}
            >
              {r.name} <span className={r === segment ? "opacity-70" : "text-muted"}>· {segmentWeeksLabel(r)}</span>
            </Link>
          ))}
        </div>
      )}
      {slate && (
        <div className="-mx-4 mb-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {slates?.map((s) => (
            <Link
              key={s.id}
              href={`/p/${slug}/standings?week=${s.week}`}
              aria-current={s.id === slate.id ? "page" : undefined}
              className={chipClass(s.id === slate.id, "min-h-11")}
            >
              {s.label ?? `Week ${s.week}`}
            </Link>
          ))}
        </div>
      )}
      {slates?.length ? (
        view === "season" ? (
          <SeasonStandings rows={rows} me={ctx.user.id} flat={!ctx.settings.confidence} week={week} bonus={bonus} />
        ) : (
          <StandingsTable rows={rows} me={ctx.user.id} weekly={Boolean(slate)} flat={!ctx.settings.confidence} total />
        )
      ) : (
        <Empty>Standings appear once the first week is published.</Empty>
      )}
    </div>
  );
}
