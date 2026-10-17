import type { Metadata } from "next";
import Link from "next/link";
import { StandingsTable } from "@/components/StandingsTable";
import { chipClass, Empty, PageTitle } from "@/components/ui";
import { getPoolContext } from "@/lib/pool";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Standings" };

export default async function StandingsPage({ params, searchParams }: PageProps<"/p/[slug]/standings">) {
  const { slug } = await params;
  const { week: weekParam } = await searchParams;
  const ctx = await getPoolContext(slug);
  const { data: slates } = await ctx.supabase
    .from("slates")
    .select("id, week, label, status")
    .eq("pool_id", ctx.pool.id)
    .neq("status", "draft")
    .order("week", { ascending: false });

  const week = typeof weekParam === "string" ? Number(weekParam) : null;
  const slate = week ? slates?.find((s) => s.week === week) : null;
  const rows = await getStandings(ctx, slate?.id);

  const tab = (active: boolean) =>
    `flex h-11 flex-1 items-center justify-center rounded-full text-sm font-medium transition ${active ? "bg-ink text-bg" : "text-muted hover:text-ink"}`;

  return (
    <>
      <PageTitle>Standings</PageTitle>
      <div className="mb-4 flex rounded-full bg-surface p-0.5">
        <Link href={`/p/${slug}/standings`} aria-current={!slate ? "page" : undefined} className={tab(!slate)}>Season</Link>
        <Link href={`/p/${slug}/standings?week=${slates?.[0]?.week ?? 1}`} aria-current={slate ? "page" : undefined} className={tab(Boolean(slate))}>Weekly</Link>
      </div>
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
      {slates?.length ? <StandingsTable rows={rows} me={ctx.user.id} /> : <Empty>Standings appear once the first week is published.</Empty>}
    </>
  );
}
