import Link from "next/link";
import { Countdown } from "@/components/Countdown";
import { StandingsTable } from "@/components/StandingsTable";
import { ChevronIcon, Empty, SectionLabel, chipClass } from "@/components/ui";
import { points, windowLabel } from "@/lib/format";
import { isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { segmentForWeek, segmentRanges, segmentWeeksLabel } from "@/lib/poolSettings";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { getStandings } from "@/lib/standings";

export default async function PoolHome({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const slate = await getCurrentSlate(ctx);
  // The current segment is the one holding the current week; none before a week is published.
  const segment = slate ? segmentForWeek(ctx.settings, slate.week) : null;
  const segmentIndex = segment ? segmentRanges(ctx.settings).findIndex((r) => r.first_week === segment.first_week) + 1 : 0;
  const [season, segmentRows] = await Promise.all([
    getStandings(ctx),
    segment ? getStandings(ctx, { fromWeek: segment.first_week, toWeek: segment.last_week }) : null,
  ]);
  const flat = !ctx.settings.confidence;

  let summary = null;
  if (slate) {
    const [games, { data: mine }, { data: score }] = await Promise.all([
      getSlateGames(ctx, slate.id),
      ctx.supabase.from("picks").select("game_id, confidence, result").eq("slate_id", slate.id).eq("user_id", ctx.user.id),
      ctx.supabase.from("slate_scores").select("points").eq("slate_id", slate.id).eq("user_id", ctx.user.id).maybeSingle(),
    ]);
    // Server render time is fine here; the countdown itself ticks client-side.
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    // The next moment any game stops taking picks: a deadline, or a tip before its deadline.
    const nextLock = games
      .filter((g) => !g.voided && !isGameLocked(g, now))
      .map((g) => g.effectiveLockAt)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    const picks = mine ?? [];
    const weekPoints = Number(score?.points ?? 0);
    // Same "possible" as the Grid: the most this week can still end at (lib/possible.ts).
    const openGameIds = games.filter((g) => !g.voided && slate.status === "open" && !isGameLocked(g, now)).map((g) => g.id);
    summary = {
      picked: picks.length,
      // Something to score: at least one of the player's picks has been decided.
      decided: picks.some((p) => p.result !== null),
      points: weekPoints,
      possible: possiblePoints({ points: weekPoints, picks, openGameIds, slotValues: slotValuesFor(ctx.settings) }),
      nextLock: slate.status === "open" ? nextLock ?? null : null,
    };
  }

  return (
    // data-wide: full screen width on desktop, like the Picks and Grid tabs.
    <div data-wide className="space-y-8">
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{ctx.pool.name}</h1>

      {slate && summary ? (
        <section className="border-b border-line pb-4">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-ink">{slate.label ?? `Week ${slate.week}`}</span>
            <span className="ml-auto truncate text-muted">{windowLabel(slate.window_start, slate.window_end, ctx.settings.timezone)}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted">My Picks</div>
              <div className="mt-0.5 text-4xl font-semibold tracking-tight tabular-nums">
                {summary.picked === 0 ? (
                  // Nothing in yet: the number becomes the way to the picks screen.
                  <Link href={`/p/${slug}/picks`} className="text-accent hover:underline">Make Picks</Link>
                ) : !summary.decided ? (
                  "Submitted"
                ) : (
                  <>
                    {points(summary.points)}
                    <span className="text-muted">/{points(summary.possible)}</span>
                    <span className="sr-only"> points of {points(summary.possible)} possible</span>
                  </>
                )}
              </div>
            </div>
            {summary.nextLock && (
              <div>
                <div className="text-xs text-muted">Next lock</div>
                <div className="mt-0.5 text-4xl font-semibold tracking-tight tabular-nums">
                  <Countdown to={summary.nextLock} done="locked" />
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 flex gap-1.5">
            <Link href={`/p/${slug}/picks`} className={chipClass(true, "", "sm")}>My Picks</Link>
            <Link href={`/p/${slug}/grid/${slate.week}`} className={chipClass(false, "", "sm")}>Everyone&apos;s picks</Link>
          </div>
        </section>
      ) : (
        <Empty>
          No week is published yet.
          {ctx.isCommissioner && (
            <> <Link className="text-accent" href={`/p/${slug}/admin/slate`}>Build the first slate</Link>.</>
          )}
        </Empty>
      )}

      <section>
        <div className="flex items-center justify-between">
          <SectionLabel>Season standings</SectionLabel>
          <Link href={`/p/${slug}/standings`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
            All <ChevronIcon className="size-4" />
          </Link>
        </div>
        <StandingsTable rows={season} me={ctx.user.id} limit={5} flat={flat} />
      </section>

      {segment && segmentRows && (
        <section>
          <div className="flex items-center justify-between">
            <SectionLabel>
              {segment.name} <span className="font-normal normal-case tracking-normal">· {segmentWeeksLabel(segment)}</span>
            </SectionLabel>
            <Link href={`/p/${slug}/standings?segment=${segmentIndex}`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
              All <ChevronIcon className="size-4" />
            </Link>
          </div>
          <StandingsTable rows={segmentRows} me={ctx.user.id} limit={5} flat={flat} />
        </section>
      )}
    </div>
  );
}
