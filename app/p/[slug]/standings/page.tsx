import type { Metadata } from "next";
import Link from "next/link";
import { StandingsTable } from "@/components/StandingsTable";
import { Empty, PageTitle } from "@/components/ui";
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
    `min-h-9 flex-1 rounded-md px-3 py-1.5 text-center font-display text-sm font-semibold uppercase ${active ? "bg-surface shadow-sm" : "text-muted"}`;

  return (
    <>
      <PageTitle>Standings</PageTitle>
      <div className="mb-3 flex rounded-lg bg-raised p-1">
        <Link href={`/p/${slug}/standings`} className={tab(!slate)}>Season</Link>
        <Link href={`/p/${slug}/standings?week=${slates?.[0]?.week ?? 1}`} className={tab(Boolean(slate))}>Weekly</Link>
      </div>
      {slate && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {slates?.map((s) => (
            <Link
              key={s.id}
              href={`/p/${slug}/standings?week=${s.week}`}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm ${s.id === slate.id ? "border-felt bg-felt text-white" : "border-border"}`}
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
