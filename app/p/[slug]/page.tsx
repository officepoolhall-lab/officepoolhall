import Link from "next/link";
import { Suspense } from "react";
import { ApPollList } from "@/components/ApPollList";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { LiveTicker } from "@/components/LiveTicker";
import { NewsList } from "@/components/NewsList";
import { StandingsTable } from "@/components/StandingsTable";
import { UpcomingWeekNote } from "@/components/UpcomingWeekNote";
import { ChevronIcon, Empty, SectionLabel, chipClass } from "@/components/ui";
import { getApPoll } from "@/lib/apPoll";
import { points, windowLabel } from "@/lib/format";
import { getNews } from "@/lib/news";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames, getUpcomingSlate } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { getStandingsBook } from "@/lib/standings";

export default async function PoolHome({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  const [slate, upcoming] = await Promise.all([getCurrentSlate(ctx), getUpcomingSlate(ctx)]);
  const sport = ctx.pool.sport === "ncaab" ? "ncaab" : "ncaaf";
  // Everything the pool's own data needs, in one round: the standings (one load of the
  // scores for both tables), the week's games, the entry's picks and score, and how many
  // picks it has for next week if that's open early. News and rankings come from other
  // sites, so they stream in below (Suspense) rather than hold up the page.
  const [book, games, { data: mine }, { data: score }, upcomingPicked] = await Promise.all([
    getStandingsBook(ctx),
    slate ? getSlateGames(ctx, slate.id) : Promise.resolve([]),
    slate
      ? ctx.supabase.from("picks").select("game_id, confidence, result").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId)
      : Promise.resolve({ data: null }),
    slate
      ? ctx.supabase.from("slate_scores").select("points").eq("slate_id", slate.id).eq("user_id", ctx.entryUserId).maybeSingle()
      : Promise.resolve({ data: null }),
    upcoming
      ? ctx.supabase
          .from("picks").select("id", { count: "exact", head: true }).eq("slate_id", upcoming.id).eq("user_id", ctx.entryUserId)
          .then(({ count }) => count ?? 0)
      : Promise.resolve(0),
  ]);
  const season = book.season();
  const weekly = slate ? book.week(slate.id) : null;
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
    // The next moment any game stops taking picks: a deadline, or a tip before its deadline.
    const nextLock = games
      .filter((g) => !g.voided && !isGameLocked(g, now))
      .map((g) => g.effectiveLockAt)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];
    const picks = mine ?? [];
    const weekly = ctx.settings.lock.mode === "weekly";
    const weekPoints = Number(score?.points ?? 0);
    // Same "possible" as the Grid: the most this week can still end at (lib/possible.ts).
    const openGameIds = games.filter((g) => !g.voided && slate.status === "open" && !isGameLocked(g, now)).map((g) => g.id);
    summary = {
      picked: picks.length,
      // Something to score: at least one of the player's picks has been decided.
      decided: picks.some((p) => p.result !== null),
      points: weekPoints,
      possible: possiblePoints({ points: weekPoints, picks, openGameIds, slotValues: slotValuesFor(ctx.settings) }),
      // Weekly lock (basketball): the week's deadline, when every pick is due.
      nextLock: slate.status !== "open" ? null : weekly ? (slate.lock_at && new Date(slate.lock_at).getTime() > now ? slate.lock_at : nextLock ?? null) : nextLock ?? null,
      weekly,
    };
  }

  return (
    // data-wide: full screen width on desktop, like the Picks and Grid tabs.
    <div data-wide className="space-y-6">
      {/* The week's scores across the top; refreshed every minute while a game is live. */}
      {games.length > 0 && <LiveTicker games={games} now={now} timezone={ctx.displayTz} />}
      <AutoRefresh active={anyLive} />

      {/* Desktop: this week + standings | top stories | rankings, each its natural height,
          all starting right under the ticker. Phones: week, standings, rankings, stories. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,22rem)]">
        <div>
          {slate && summary ? (
            <section className="mb-6 border-b border-line pb-4">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold text-ink">{slate.label ?? `Week ${slate.week}`}</span>
                <span className="truncate text-xs text-muted">{windowLabel(slate.window_start, slate.window_end, tz)}</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-muted">{ctx.managing ? `${ctx.managing.ownerName}'s picks (you co-manage)` : "My Picks"}</div>
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
                    <div className="text-xs text-muted">{summary.weekly ? "Week Locks" : "Next Game Locks"}</div>
                    <div className="mt-0.5 text-4xl font-semibold tracking-tight tabular-nums">
                      <Countdown to={summary.nextLock} done="locked" />
                    </div>
                  </div>
                )}
              </div>
              {upcoming && (
                <UpcomingWeekNote
                  href={`/p/${slug}/picks?week=${upcoming.week}`}
                  slate={upcoming}
                  picked={upcomingPicked}
                  picksPerSlate={ctx.settings.picks_per_slate}
                  timezone={tz}
                  className="mt-3"
                />
              )}
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
            {/* Top 8, plus the viewer's own row when they're further down. */}
            <StandingsTable rows={season} me={ctx.entryUserId} flat={flat} compact limit={8} playerHref={(id) => `/p/${slug}/standings/${id}`} />
          </section>
          {slate && weekly && (
            <section className="mt-6">
              <div className="flex items-center justify-between">
                <SectionLabel>{slate.label ?? `Week ${slate.week}`} standings</SectionLabel>
                <Link href={`/p/${slug}/standings?week=${slate.week}`} className="-mr-1 inline-flex h-11 items-center gap-0.5 px-1 text-sm font-medium text-accent">
                  All <ChevronIcon className="size-4" />
                </Link>
              </div>
              <StandingsTable rows={weekly} me={ctx.entryUserId} flat={flat} compact weekly limit={8} playerHref={(id) => `/p/${slug}/standings/${id}`} />
            </section>
          )}
        </div>
        <div className="order-last lg:order-none">
          <Suspense fallback={<Placeholder title={sport === "ncaaf" ? "College football news" : "College basketball news"} rows={6} />}>
            <News sport={sport} now={now} />
          </Suspense>
        </div>
        <Suspense fallback={<Placeholder title="Rankings" rows={10} />}>
          <Poll sport={sport} timezone={ctx.displayTz} />
        </Suspense>
      </div>
    </div>
  );
}

/** Top stories from the news sites; streams in after the rest of the page. */
async function News({ sport, now }: { sport: "ncaaf" | "ncaab"; now: number }) {
  const news = await getNews(sport, 10);
  return <NewsList stories={news} now={now} title={sport === "ncaaf" ? "College football news" : "College basketball news"} />;
}

/** AP Top 25 (or CFP rankings) from ESPN; streams in after the rest of the page. */
async function Poll({ sport, timezone }: { sport: "ncaaf" | "ncaab"; timezone: string }) {
  return <ApPollList poll={await getApPoll(sport)} timezone={timezone} />;
}

/** Grey lines where news or rankings will appear, so the layout doesn't jump. */
function Placeholder({ title, rows }: { title: string; rows: number }) {
  return (
    <section aria-busy="true" aria-label={title}>
      <SectionLabel>{title}</SectionLabel>
      <ul className="mt-2 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="h-4 animate-pulse rounded bg-surface" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
        ))}
      </ul>
    </section>
  );
}
