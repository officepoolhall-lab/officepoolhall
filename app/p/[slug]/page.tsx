import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { StandingsTable } from "@/components/StandingsTable";
import { Card, Empty, LinkButton, StatusBadge } from "@/components/ui";
import { windowLabel } from "@/lib/format";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { getStandings } from "@/lib/standings";

export default async function PoolHome({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const slate = await getCurrentSlate(ctx);
  const season = await getStandings(ctx);

  let summary = null;
  if (slate) {
    const [games, { data: mine }] = await Promise.all([
      getSlateGames(ctx, slate.id),
      ctx.supabase.from("picks").select("game_id").eq("slate_id", slate.id).eq("user_id", ctx.user.id),
    ]);
    // Server render time is fine here; the countdown itself ticks client-side.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const next = games.find((g) => !g.voided && new Date(g.startAt).getTime() > now);
    summary = {
      picked: mine?.length ?? 0,
      total: ctx.settings.picks_per_slate,
      nextLock: slate.lock_at && new Date(slate.lock_at).getTime() > now ? slate.lock_at : next?.startAt ?? null,
      games: games.length,
    };
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold uppercase tracking-wide">{ctx.pool.name}</h1>
        <p className="text-sm text-muted">
          {ctx.settings.confidence ? "Confidence pool" : ctx.settings.pick_type === "ats" ? "Against the spread" : "Straight up"} ·{" "}
          {ctx.settings.picks_per_slate} picks a week
        </p>
      </div>

      {slate && summary ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 bg-felt px-4 py-2 text-white">
            <span className="font-display text-lg font-bold uppercase">{slate.label ?? `Week ${slate.week}`}</span>
            <StatusBadge status={slate.status} />
            <span className="ml-auto text-xs text-white/70">{windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}</span>
          </div>
          <div className="grid grid-cols-2 divide-x divide-border">
            <div className="p-4">
              <div className="text-xs uppercase text-muted">My picks</div>
              <div className="font-display text-4xl font-bold tabular-nums">
                {summary.picked}<span className="text-xl text-muted">/{summary.total}</span>
              </div>
            </div>
            <div className="p-4">
              <div className="text-xs uppercase text-muted">{summary.nextLock ? "Next lock" : "Status"}</div>
              <div className="font-display text-4xl font-bold">
                {summary.nextLock ? <Countdown to={summary.nextLock} done="locked" /> : slate.status === "graded" ? "Final" : "Locked"}
              </div>
            </div>
          </div>
          <div className="flex gap-2 border-t border-border p-3">
            <LinkButton href={`/p/${slug}/picks`} kind={slate.status === "open" ? "brass" : "ghost"} className="flex-1">
              {slate.status === "open" ? (summary.picked < summary.total ? "Make picks" : "Review picks") : "My picks"}
            </LinkButton>
            <LinkButton href={`/p/${slug}/grid/${slate.week}`} kind="ghost" className="flex-1">Everyone&apos;s picks</LinkButton>
          </div>
        </Card>
      ) : (
        <Empty>
          No week is published yet.
          {ctx.isCommissioner && (
            <> <Link className="text-felt underline" href={`/p/${slug}/admin/slate`}>Build the first slate</Link>.</>
          )}
        </Empty>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-bold uppercase">Season standings</h2>
          <Link href={`/p/${slug}/standings`} className="text-sm text-felt">All ›</Link>
        </div>
        <StandingsTable rows={season} me={ctx.user.id} limit={5} />
      </section>
    </div>
  );
}
