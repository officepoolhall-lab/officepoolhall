import { FitText } from "@/components/FitText";
import { isPickX } from "@/lib/pickx";
import { PickXHome } from "@/components/pickx/PickXPages";
import Link from "next/link";
import { Suspense } from "react";
import { ApPollList } from "@/components/ApPollList";
import { NflStandingsList } from "@/components/NflStandingsList";
import { getNflStandings } from "@/lib/nflStandings";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Countdown } from "@/components/Countdown";
import { LiveTicker } from "@/components/LiveTicker";
import { NewsList } from "@/components/NewsList";
import { StandingsTable } from "@/components/StandingsTable";
import { HomeStandings } from "@/components/HomeStandings";
import { FillColumn } from "@/components/FillColumn";
import { UpcomingWeekNote } from "@/components/UpcomingWeekNote";
import { BracketCard } from "@/components/BracketCard";
import { pickCount } from "@/lib/bracket";
import { getBracket, getBracketEntries } from "@/lib/brackets";
import { Empty, SectionLabel, chipClass } from "@/components/ui";
import { getApPoll } from "@/lib/apPoll";
import { points } from "@/lib/format";
import { getNews } from "@/lib/news";
import { hasStarted, isGameLocked } from "@/lib/locks";
import { getCurrentSlate, getPoolContext, getSlateGames, getUpcomingSlate } from "@/lib/pool";
import { possiblePoints, slotValuesFor } from "@/lib/possible";
import { getTournamentPicks, getTournaments, tournamentUpside } from "@/lib/tournaments";
import { getStandingsBook, standingsByPoints } from "@/lib/standings";
import { NEWS_TITLE, teamSport, type TeamSport } from "@/lib/sports";

export default async function PoolHome({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const ctx = await getPoolContext(slug);
  // An NCAA Pick X pool has its own Home.
  if (isPickX(ctx.pool.settings)) return <PickXHome ctx={ctx} slug={slug} />;
  const [slate, upcoming] = await Promise.all([getCurrentSlate(ctx), getUpcomingSlate(ctx)]);
  const sport = teamSport(ctx.pool.sport);
  // Everything the pool's own data needs, in one round: the standings (one load of the
  // scores for both tables), the week's games, the entry's picks and score, and how many
  // picks it has for next week if that's open early. News and rankings come from other
  // sites, so they stream in below (Suspense) rather than hold up the page.
  const [book, games, { data: mine }, { data: score }, upcomingPicked, bracket, allTournaments] = await Promise.all([
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
    getBracket(ctx),
    getTournaments(ctx),
  ]);
  // This week's in-season tournaments (MTEs) count toward its score, so they're in "possible" too.
  const weekTournaments = slate ? allTournaments.filter((t) => t.week === slate.week) : [];
  const myTournamentPicks = await getTournamentPicks(ctx, weekTournaments.map((t) => t.id), ctx.entryUserId);
  // The NCAA Tournament bracket, from when it's set until it has a champion.
  const bracketEntry = bracket && !bracket.results["6-0"] ? (await getBracketEntries(ctx, bracket.id, ctx.entryUserId))[0] : undefined;
  const season = book.season();
  const weekly = slate ? book.week(slate.id) : null;
  // Record pools lead with W–L; points pools (the setting, or confidence) with points.
  const flat = !standingsByPoints(ctx.settings);
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
      possible:
        possiblePoints({ points: weekPoints, picks, openGameIds, slotValues: slotValuesFor(ctx.settings) }) +
        tournamentUpside(weekTournaments, myTournamentPicks, ctx.entryUserId, now),
      // Weekly lock (basketball): the week's deadline, when every pick is due.
      nextLock: slate.status !== "open" ? null : weekly ? (slate.lock_at && new Date(slate.lock_at).getTime() > now ? slate.lock_at : nextLock ?? null) : nextLock ?? null,
      weekly,
    };
  }

  // Desktop: rows sent past the phone limit; FillColumn shows as many as fit beside the
  // rankings or NFL standings.
  const homeRowsLg = 40;

  return (
    // data-wide: full screen width on desktop, like the Picks and Grid tabs.
    <div data-wide className="space-y-6">
      {/* The week's scores across the top; refreshed every minute while a game is live. */}
      {games.length > 0 && <LiveTicker games={games} now={now} timezone={ctx.displayTz} />}
      <AutoRefresh active={anyLive} />

      {/* Desktop: this week + standings | top stories | rankings, each its natural height,
          all starting right under the ticker. Phones: week, standings, rankings, stories. */}
      {/* Desktop: the rankings (or NFL standings) on the right set the row's height; the left
          column and the news fill exactly that much (FillColumn), so all three end level. Thin
          blue lines split the three columns. */}
      {/* Desktop: standings | news | poll or NFL standings. On smaller desktops the side columns
          narrow (left 20rem / right 17rem; 22 / 20 from xl; 23.5 / 23.5 from 2xl) so the news in the
          middle keeps its room. Their one-line text and titles shrink to fit rather than wrap. */}
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,17rem)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,20rem)] 2xl:grid-cols-[minmax(0,23.5rem)_minmax(0,1fr)_minmax(0,23.5rem)] lg:gap-x-0 lg:divide-x lg:divide-[color-mix(in_srgb,var(--accent)_35%,transparent)]">
        <FillColumn className="lg:flex lg:flex-col lg:pr-6">
          {slate && summary ? (
            <section className="mb-6 border-b border-line pb-4">
              {/* Just the week; its dates go without saying. */}
              <div className="whitespace-nowrap text-lg font-bold text-ink">{slate.label ?? `Week ${slate.week}`}</div>
              <div className="mt-2 grid grid-cols-2 gap-4 [&>*]:min-w-0">
                {/* Guests have no picks of their own: just the countdown. */}
                {!ctx.isGuest && (
                <div className="min-w-0">
                  <FitText min={9} className="text-xs text-muted">
                    {/* Basketball: "My Week 2 Score" (co-managers too), the entry's points so far over the most
                        it can still reach. The week is the current one: the published week whose
                        window holds today (getCurrentSlate), so it moves on by itself each week. */}
                    {ctx.pool.sport === "ncaab"
                      ? `My ${slate.label ?? `Week ${slate.week}`} Score`
                      : ctx.managing
                        ? `${ctx.managing.ownerName}'s picks (you co-manage)`
                        : "My Picks"}
                  </FitText>
                  {/* One line always: the big number steps down to fit a narrow column. */}
                  <FitText min={18} className="mt-0.5 text-4xl font-extrabold tracking-[-0.03em] tabular-nums">
                    {summary.picked === 0 ? (
                      // Nothing in yet: a plain 0 of N, with the button to the picks screen below the row.
                      <span className="text-muted">
                        0/{ctx.settings.picks_per_slate}
                        <span className="sr-only"> picks made</span>
                      </span>
                    ) : !summary.decided && ctx.pool.sport !== "ncaab" ? (
                      "Submitted"
                    ) : (
                      <>
                        {points(summary.points)}
                        <span className="text-muted">/{points(summary.possible)}</span>
                        <span className="sr-only"> points of {points(summary.possible)} possible</span>
                      </>
                    )}
                  </FitText>
                </div>
                )}
                {summary.nextLock && (
                  <div className="min-w-0">
                    <FitText min={9} className="text-xs text-muted">{summary.weekly ? "Week Locks" : "Next Game Locks"}</FitText>
                    <FitText min={18} className="mt-0.5 text-4xl font-extrabold tracking-[-0.03em] tabular-nums">
                      <Countdown to={summary.nextLock} done="locked" />
                    </FitText>
                  </div>
                )}
              </div>
              {summary.picked === 0 && !ctx.isGuest && (
                <Link
                  href={`/p/${slug}/picks`}
                  className="mt-3 flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:brightness-95"
                >
                  <span className="whitespace-nowrap">Make {slate.label ?? `Week ${slate.week}`} Picks <span aria-hidden>→</span></span>
                </Link>
              )}
              {upcoming && !ctx.isGuest && (
                <UpcomingWeekNote
                  simple
                  href={`/p/${slug}/picks?week=${upcoming.week}`}
                  slate={upcoming}
                  picked={upcomingPicked}
                  picksPerSlate={ctx.settings.picks_per_slate}
                  timezone={tz}
                  className="mt-3"
                />
              )}
              {bracket && !bracket.results["6-0"] && !ctx.isGuest && (
                <BracketCard
                  href={`/p/${slug}/bracket`}
                  name={bracket.name}
                  lockAt={bracket.lockAt}
                  picked={bracketEntry ? pickCount(bracketEntry.picks) : 0}
                  points={Object.keys(bracket.results).length ? (bracketEntry?.points ?? 0) : null}
                  locked={new Date(bracket.lockAt).getTime() <= now}
                  timezone={ctx.displayTz}
                  className="mt-3"
                />
              )}
              <div className="mt-3 flex gap-1.5 whitespace-nowrap">
                {!ctx.isGuest && <Link href={`/p/${slug}/picks`} className={chipClass(true, "", "sm")}>My Picks</Link>}
                <Link href={`/p/${slug}/grid/${slate.week}`} className={chipClass(ctx.isGuest, "", "sm")}>Everyone&apos;s picks</Link>
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
          {/* Season and this week in one table with buttons to switch (season only on phones), so
              the column ends near the rankings beside it on desktop. Top 8, plus the viewer's own
              row when they're further down. */}
          <HomeStandings
            views={[
              {
                id: "season",
                label: "Season",
                title: "Standings",
                href: `/p/${slug}/standings`,
                content: <StandingsTable rows={season} me={ctx.entryUserId} flat={flat} compact limit={8} limitLg={homeRowsLg} playerHref={(id) => `/p/${slug}/standings/${id}`} />,
              },
              ...(slate && weekly
                ? [
                    {
                      id: "week",
                      label: slate.label ?? `Week ${slate.week}`,
                      title: "Standings",
                      href: `/p/${slug}/standings?week=${slate.week}`,
                      content: <StandingsTable rows={weekly} me={ctx.entryUserId} flat={flat} compact weekly limit={8} limitLg={homeRowsLg} playerHref={(id) => `/p/${slug}/standings/${id}`} />,
                    },
                  ]
                : []),
            ]}
          />
        </FillColumn>
        <FillColumn className="order-last lg:order-none lg:px-6">
          <Suspense fallback={<Placeholder title={NEWS_TITLE[sport]} rows={6} />}>
            <News sport={sport} now={now} />
          </Suspense>
        </FillColumn>
        {/* The NFL has no poll: its division standings take that spot. */}
        <div className="lg:pl-6">
          {sport === "nfl" ? (
            <Suspense fallback={<Placeholder title="NFL Standings" rows={10} />}>
              <NflStandingsBox />
            </Suspense>
          ) : (
            <Suspense fallback={<Placeholder title="Rankings" rows={10} />}>
              <Poll sport={sport} timezone={ctx.displayTz} />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

/** Top stories from the news sites; streams in after the rest of the page. */
async function News({ sport, now }: { sport: TeamSport; now: number }) {
  const news = await getNews(sport, 10);
  return <NewsList stories={news} now={now} title={NEWS_TITLE[sport]} />;
}

/** AP Top 25 (or CFP rankings) from ESPN; streams in after the rest of the page. */
async function Poll({ sport, timezone }: { sport: TeamSport; timezone: string }) {
  return <ApPollList poll={await getApPoll(sport, { currentRecords: true })} timezone={timezone} />;
}

/** NFL division standings from ESPN; streams in after the rest of the page. */
async function NflStandingsBox() {
  return <NflStandingsList standings={await getNflStandings()} />;
}

/** Grey lines where news or rankings will appear, so the layout doesn't jump. */
function Placeholder({ title, rows }: { title: string; rows: number }) {
  return (
    <section aria-busy="true" aria-label={title}>
      <SectionLabel className="!text-sm lg:!text-base">{title}</SectionLabel>
      <ul className="mt-2 space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="h-4 animate-pulse rounded bg-surface" style={{ width: `${70 + ((i * 13) % 30)}%` }} />
        ))}
      </ul>
    </section>
  );
}
