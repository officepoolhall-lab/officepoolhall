import Link from "next/link";
import { ApPollList } from "@/components/ApPollList";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { LiveTicker } from "@/components/LiveTicker";
import { NewsList } from "@/components/NewsList";
import { StandingsTable } from "@/components/StandingsTable";
import { ChevronIcon, Empty, SectionLabel, chipClass } from "@/components/ui";
import { getApPoll } from "@/lib/apPoll";
import { points, windowLabel } from "@/lib/format";
import { getNews } from "@/lib/news";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { getStandings } from "@/lib/standings";

export default async function PoolHome({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const slate = await getCurrentSlate(ctx);
  const sport = ctx.pool.sport === "ncaab" ? "ncaab" : "ncaaf";
  const [season, poll, news, games] = await Promise.all([
    getStandings(ctx),
    getApPoll(sport),
    getNews(sport, 12),
    slate ? getSlateGames(ctx, slate.id) : Promise.resolve([]),
  ]);
  const flat = !ctx.settings.confidence;
  const tz = ctx.settings.timezone;
  // Server render time is fine here; the countdown itself ticks client-side.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const anyLive = games.some(
    (g) => !g.voided && hasStarted(g, now) && g.status !== "final" && !g.overridden && g.status !== "postponed" && g.status !== "cancelled",
  );

  let summary = null;
  if (slate) {
    const [{ data: mine }, { data: score }] = await Promise.all([
      ctx.supabase.from("picks").select("game_id, confidence, result").eq("slate_id", slate.id).eq("user_id", ctx.user.id),
      ctx.supabase.from("slate_scores").select("points").eq("slate_id", slate.id).eq("user_id", ctx.user.id).maybeSingle(),
    ]);
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
    <div data-wide className="space-y-6">
      {/* The week's scores across the top; refreshed every minute while a game is live. */}
      {games.length > 0 && <LiveTicker games={games} now={now} timezone={tz} />}
      <AutoRefresh active={anyLive} />

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{ctx.pool.name}</h1>

      {slate && summary ? (
        <section className="border-b border-line pb-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-ink">{slate.label ?? `Week ${slate.week}`}</span>
            <span className="truncate text-xs text-muted">{windowLabel(slate.window_start, slate.window_end, tz)}</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4">
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

      {/* Desktop: standings | top stories | rankings. The rankings column sets the height;
          the other two scroll inside it if they're ever taller, so the page ends with the
          Top 25. Phones: standings, rankings, then stories. */}
      <div className="grid gap-8 lg:min-h-[32rem] lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div className="lg:relative">
          <section className="lg:absolute lg:inset-0 lg:overflow-y-auto">
            <div className="flex items-center justify-between">
              <SectionLabel>Season standings</SectionLabel>
              <Link href={`/p/${slug}/standings`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
                All <ChevronIcon className="size-4" />
              </Link>
            </div>
            {/* Top 10, plus the viewer's own row when they're further down. */}
            <StandingsTable rows={season} me={ctx.user.id} flat={flat} compact limit={10} />
          </section>
        </div>
        <div className="order-last lg:relative lg:order-none">
          <div className="lg:absolute lg:inset-0 lg:overflow-y-auto">
            <NewsList stories={news} now={now} title={sport === "ncaaf" ? "College football news" : "College basketball news"} />
          </div>
        </div>
        <ApPollList poll={poll} timezone={tz} />
      </div>
    </div>
  );
}
