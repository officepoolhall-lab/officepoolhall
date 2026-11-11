import type { Metadata } from "next";
import Link from "next/link";
import { AutoRefresh } from "@/components/AutoRefresh";
import { GolfGrid, type GridRow, type GridWeek } from "@/components/GolfGrid";
import { chipClass, Empty, PageTitle } from "@/components/ui";
import { getGolfContext, shortEventName } from "@/lib/golf";
import { getGolfStandingsData } from "@/lib/golfStandings";

export const metadata: Metadata = { title: "League Grid" };

/**
 * Entries down the left in standings order, tournaments across the top through the current
 * week. Others' picks for the open week stay hidden until the lock (the database doesn't send
 * them); during play each pick shows its golfer's live place.
 */
const SORTS = [
  { id: "season", label: "Season" },
  { id: "name", label: "A–Z" },
] as const;

export default async function GolfGridPage({ params, searchParams }: PageProps<"/p/[slug]/golf/grid">) {
  const { slug } = await params;
  const { sort: sortParam } = await searchParams;
  const sort = sortParam === "name" ? "name" : "season";
  const ctx = await getGolfContext(slug);
  // eslint-disable-next-line react-hooks/purity
  const data = await getGolfStandingsData(ctx, Date.now());

  const weekList = [...data.played];
  if (data.current && !weekList.some((w) => w.week === data.current!.week)) weekList.push({ week: data.current.week, name: data.current.name, final: false });

  const rows: GridRow[] = data.rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    isMe: r.isMe,
    place: r.place,
    tied: r.tied,
    total: r.total,
    cells: weekList.map((w) => {
      const isCurrent = data.current?.week === w.week;
      const l = r.log.find((x) => x.week === w.week);
      const golfer = isCurrent ? (r.thisWeek?.golfer ?? l?.golfer ?? null) : (l?.golfer ?? null);
      return {
        golfer,
        hidden: isCurrent ? !!r.thisWeek?.hidden : false,
        finish: isCurrent && !w.final ? (r.thisWeek?.live ?? l?.finish ?? "") : (l?.finish ?? ""),
        earned: l?.earned ?? 0,
        final: w.final,
        won: w.final && l?.finish === "1",
        topOfWeek: false,
      };
    }),
  }));

  // The week's top pick (ties all marked) and the most-picked golfer.
  const weeks: GridWeek[] = weekList.map((w, i) => {
    const top = w.final ? Math.max(0, ...rows.map((r) => r.cells[i].earned)) : 0;
    if (top > 0) for (const r of rows) if (r.cells[i].earned === top) r.cells[i].topOfWeek = true;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const c = r.cells[i];
      if (c.golfer && !c.hidden) counts.set(c.golfer, (counts.get(c.golfer) ?? 0) + 1);
    }
    // Only for a locked week: during an open week only the viewer's own pick is known.
    const open = data.current?.week === w.week && data.current.open;
    const [golfer, count] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    return {
      week: w.week,
      short: shortEventName(w.name),
      name: w.name,
      final: w.final,
      live: data.current?.week === w.week && data.current.live,
      open,
      popular: !open && golfer ? { golfer, count: count! } : null,
    };
  });

  if (sort === "name") rows.sort((a, b) => a.name.localeCompare(b.name));

  return (
    // Fills the screen like the football and basketball grids; the grid scrolls inside it.
    <div
      data-fill-viewport
      className="flex max-h-[max(24rem,calc(100dvh-7.75rem-4px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] flex-col sm:max-h-[max(24rem,calc(100dvh-8rem-3px-env(safe-area-inset-top)-env(safe-area-inset-bottom)))]"
    >
      <h1 className="sr-only">League Grid</h1>
      <AutoRefresh active={!!data.current?.live} seconds={120} />
      <div className="-mx-4 mb-1 flex shrink-0 items-center gap-1 px-4 py-1">
        <span className="mr-0.5 text-[11px] font-medium text-muted">Sort</span>
        {SORTS.map((x) => (
          <Link
            key={x.id}
            href={`/p/${slug}/golf/grid${x.id === "season" ? "" : `?sort=${x.id}`}`}
            aria-current={x.id === sort ? "true" : undefined}
            className={chipClass(x.id === sort, "", "xs")}
          >
            {x.label}
          </Link>
        ))}
      </div>
      {weeks.length === 0 || rows.length === 0 ? (
        <>
          <PageTitle>League Grid</PageTitle>
          <Empty>The grid fills in once the first tournament is under way.</Empty>
        </>
      ) : (
        <GolfGrid rows={rows} weeks={weeks} />
      )}
    </div>
  );
}
