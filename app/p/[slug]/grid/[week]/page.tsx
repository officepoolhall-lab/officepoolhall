import type { Metadata } from "next";
import Link from "next/link";
import { Empty, LockIcon, PageTitle } from "@/components/ui";
import { formatSpread, points } from "@/lib/format";
import { getPoolContext, getSlateGames } from "@/lib/pool";
import { getStandings } from "@/lib/standings";

export const metadata: Metadata = { title: "Selections grid" };

export default async function GridPage({ params }: PageProps<"/p/[slug]/grid/[week]">) {
  const { slug, week } = await params;
  const ctx = await getPoolContext(slug);
  const { data: slates } = await ctx.supabase
    .from("slates").select("id, week, label, status").eq("pool_id", ctx.pool.id).neq("status", "draft").order("week");
  const slate = slates?.find((s) => s.week === Number(week));
  if (!slate) return (<><PageTitle>Selections</PageTitle><Empty>That week isn&apos;t published.</Empty></>);

  const [games, standings, { data: picks }] = await Promise.all([
    getSlateGames(ctx, slate.id),
    getStandings(ctx, slate.id),
    // RLS only returns other players' picks on games that have started.
    ctx.supabase.from("picks").select("user_id, game_id, picked_side, confidence, result, points").eq("slate_id", slate.id),
  ]);
  const byCell = new Map((picks ?? []).map((p) => [`${p.user_id}:${p.game_id}`, p]));
  // eslint-disable-next-line react-hooks/purity -- render-time snapshot of which columns have started
  const now = Date.now();

  return (
    <>
      <PageTitle sub="Each game's column fills in once it starts.">Selections</PageTitle>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {slates?.map((s) => (
          <Link key={s.id} href={`/p/${slug}/grid/${s.week}`}
            className={`shrink-0 rounded-full border px-3 py-1 text-sm ${s.id === slate.id ? "border-felt bg-felt text-white" : "border-border"}`}>
            {s.label ?? `Week ${s.week}`}
          </Link>
        ))}
      </div>
      <div className="-mx-4 overflow-x-auto border-y border-border bg-surface sm:mx-0 sm:rounded-xl sm:border">
        <table className="border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-28 border-b border-r border-border bg-surface px-3 py-2 text-left font-display uppercase">Player</th>
              <th className="border-b border-border bg-surface px-2 font-display uppercase">Pts</th>
              {games.map((g) => {
                const started = new Date(g.startAt).getTime() <= now;
                const winner =
                  (g.status === "final" || g.overridden) && g.homeScore !== null && g.awayScore !== null
                    ? g.homeScore - g.awayScore + (ctx.settings.pick_type === "ats" ? (g.spread ?? 0) : 0)
                    : null;
                return (
                  <th key={g.id} className={`min-w-14 border-b border-border px-1 py-1.5 text-center align-bottom font-display text-xs font-semibold ${g.voided ? "line-through opacity-50" : ""}`}>
                    <div className={winner !== null && winner < 0 ? "text-win" : ""}>{g.away.abbreviation}</div>
                    <div className="text-muted">@</div>
                    <div className={winner !== null && winner > 0 ? "text-win" : ""}>{g.home.abbreviation}</div>
                    {ctx.settings.pick_type === "ats" && <div className="text-muted tabular-nums">{formatSpread(g.spread)}</div>}
                    {!started && <LockIcon className="mx-auto size-3 text-muted" />}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {standings.map((r) => {
              const mine = r.userId === ctx.user.id;
              return (
                <tr key={r.userId} className={mine ? "bg-brass/15" : ""}>
                  <th className={`sticky left-0 z-10 max-w-36 truncate border-r border-border px-3 py-1 text-left font-medium ${mine ? "bg-[color-mix(in_srgb,var(--brass)_15%,var(--surface))]" : "bg-surface"}`}>
                    {r.name}
                  </th>
                  <td className="px-2 text-center font-display text-base font-bold tabular-nums">{points(r.points)}</td>
                  {games.map((g) => {
                    const p = byCell.get(`${r.userId}:${g.id}`);
                    const team = p ? (p.picked_side === "home" ? g.home : g.away) : null;
                    const tint = p?.result === "win" ? "bg-win/20" : p?.result === "loss" ? "bg-loss/15 text-muted" : "";
                    return (
                      <td key={g.id} className={`h-11 border-t border-border px-1 text-center ${tint}`}>
                        {team && (
                          <div className="leading-tight">
                            <div className="font-display text-xs font-semibold">{team.abbreviation}</div>
                            {p?.confidence != null && <div className="font-display text-sm font-bold tabular-nums">{p.confidence}</div>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
