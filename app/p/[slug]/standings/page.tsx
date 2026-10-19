import type { Metadata } from "next";
import Link from "next/link";
import { StandingsTable } from "@/components/StandingsTable";
import { chipClass, Empty, PageTitle } from "@/components/ui";
import { getPoolContext } from "@/lib/pool";
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

  const tab = (active: boolean) =>
    `flex h-11 flex-1 items-center justify-center rounded-full text-sm font-medium transition ${active ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;

  return (
    // data-wide: full screen width on desktop.
    <div data-wide>
      <PageTitle>Standings</PageTitle>
      <div className="mb-4 flex rounded-full bg-surface p-0.5">
        <Link href={`/p/${slug}/standings`} aria-current={view === "season" ? "page" : undefined} className={tab(view === "season")}>Season</Link>
        {segments.length > 0 && (
          <Link
            href={`/p/${slug}/standings?segment=${defaultSegment}`}
            aria-current={view === "segment" ? "page" : undefined}
            className={tab(view === "segment")}
          >
            Segments
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
        <StandingsTable rows={rows} me={ctx.user.id} weekly={Boolean(slate)} flat={!ctx.settings.confidence} total />
      ) : (
        <Empty>Standings appear once the first week is published.</Empty>
      )}
    </div>
  );
}
