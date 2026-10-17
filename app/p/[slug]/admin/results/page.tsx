import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Card, Empty, StatusBadge } from "@/components/ui";
import { gameTime } from "@/lib/format";
import { getSlateGames, requireCommissioner } from "@/lib/pool";
import { overrideResult, setVoided } from "../actions";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ params, searchParams }: PageProps<"/p/[slug]/admin/results">) {
  const { slug } = await params;
  const { week } = await searchParams;
  const ctx = await requireCommissioner(slug);
  const { data: slates } = await ctx.supabase
    .from("slates").select("id, week, label, status").eq("pool_id", ctx.pool.id).neq("status", "draft").order("week", { ascending: false });
  const slate = slates?.find((s) => s.week === Number(week)) ?? slates?.[0];
  if (!slate) return <Empty>Results show up here once a week is published.</Empty>;
  const games = await getSlateGames(ctx, slate.id);
  const tz = ctx.settings.timezone;

  return (
    <>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {slates?.map((s) => (
          <Link key={s.id} href={`/p/${slug}/admin/results?week=${s.week}`}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${s.id === slate.id ? "border-felt bg-felt text-white" : "border-border"}`}>
            {s.label ?? `Week ${s.week}`} <StatusBadge status={s.status} />
          </Link>
        ))}
      </div>
      <p className="mb-3 text-sm text-muted">
        Scores come from ESPN every few minutes. Override one here if it&apos;s wrong — your score wins over the feed and
        standings recompute right away. Void a game (postponed, cancelled) to score it 0 for everyone.
      </p>
      <Card>
        <ul className="divide-y divide-border">
          {games.map((g) => (
            <li key={g.id} className={`px-4 py-3 ${g.voided ? "opacity-60" : ""}`}>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="flex-1 font-medium">
                  {g.away.short_name} {g.neutral ? "vs" : "@"} {g.home.short_name}
                </span>
                <span className="text-xs text-muted">
                  {gameTime(g.startAt, tz)} · {g.voided ? "VOID" : g.overridden ? "OVERRIDDEN" : g.status.replace("_", " ").toUpperCase()}
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <ActionForm action={overrideResult.bind(null, slug, slate.id, g.id)} className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-xs text-muted">
                        {g.away.abbreviation}
                        <input name="away" type="number" min={0} defaultValue={g.awayScore ?? ""} className="w-16 rounded-md border border-border px-2 py-1.5 text-right tabular-nums text-ink" />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-muted">
                        {g.home.abbreviation}
                        <input name="home" type="number" min={0} defaultValue={g.homeScore ?? ""} className="w-16 rounded-md border border-border px-2 py-1.5 text-right tabular-nums text-ink" />
                      </label>
                      <SubmitButton kind="ghost" pending="…" className="!min-h-9 !px-3 text-sm">Save</SubmitButton>
                      {g.overridden && (
                        <button name="clear" value="1" className="text-xs text-muted underline">use feed</button>
                      )}
                </ActionForm>
                <span className="ml-auto">
                  <ActionButton action={setVoided.bind(null, slug, slate.id, g.id, !g.voided)} kind={g.voided ? "ghost" : "danger"} className="!min-h-9 !px-3 text-sm">
                    {g.voided ? "Un-void" : "Void"}
                  </ActionButton>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
